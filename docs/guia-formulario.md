# Guía del formulario, explicada desde cero

> Para quien llega nuevo al proyecto. Aquí no hay teoría: sólo qué datos entran, dónde
> se guardan y cómo se relacionan entre sí. Los detalles técnicos están en
> `docs/domain.md` y `docs/form-response.md`; esta guía es el mapa para entenderlos.

---

## 1. La idea en una frase

Cada persona del evento llena un formulario en su celular. Nosotros guardamos lo que
responde, y con eso el sistema calcula con quién es compatible. Esta guía explica
**cómo se guarda lo que responde**.

## 2. El formulario no es uno, son tres

Desde el **D18** (22-08-2026) el formulario se acortó: una sola pantalla de registro y
después, directo a las preguntas. Cada pantalla se guarda apenas se responde, así que si
alguien cierra la pestaña, lo anterior queda.

| Paso | Qué pregunta | Dónde se guarda |
| --- | --- | --- |
| 1 · registro | foto, nombre, género y fecha de nacimiento, todo junto | tabla `participants` (se crea la fila, con `photo_url`, `gender`, `birthdate` y los tres consentimientos en `true`) |
| 2 · ronda declarada | seis preguntas normales con 4 opciones cada una (se guarda 0 a 3), más una lista de gustos. Tres pantallas | `participants.money_posture` … `participants.chronotype`, `participants.tags` |
| 3 · quiz | 15 situaciones, cada una con 4 opciones; la persona marca la que más se le parece y la que menos | tabla `quiz_responses` (**una fila por pregunta respondida**, hasta 15) |

Lo que ya no se pregunta: el consentimiento (participar *es* consentir en esta versión),
el equipo y el track, los filtros de cada lente, y la banda de edad — esa se calcula sola
a partir de la fecha de nacimiento. Ninguna pantalla dice qué se está midiendo: no hay
títulos de categoría, no hay "Paso 4 de 5" y no hay marca de agua; sólo una barra de
progreso que cubre los 19 pasos del recorrido (1 registro + 3 pantallas + 15 bloques).

## 3. ¿Cómo sabemos quién es quién? (la cookie)

No hay login ni contraseña. En el paso 1 el servidor crea la persona y le da a su
navegador una **cookie** llamada `hookai_session` con un código largo al azar (un
*uuid*, algo como `01a02a27-7af6-7dfe-ac61-6a93bfef6c1a`). Desde ahí, cada envío llega
con esa cookie y el servidor sabe a qué fila de `participants` pertenece.

Ese código se guarda en su propia tabla, `participant_sessions`, separado de los datos
de la persona. Razón: que **nunca** se nos escape por accidente cuando mostramos datos de
alguien. Nadie, ni siquiera el propio usuario, ve ese código en pantalla.

## 4. El "contrato": qué acepta cada paso

Un *contrato* es simplemente la lista de campos que el servidor acepta para un paso, con
sus reglas. Si lo que llega no cumple el contrato, el servidor lo rechaza y no guarda
nada. Lo escribimos con una librería llamada **zod**, que es un validador: le das un
objeto y te dice si cumple o no.

Así se lee un contrato (paso 3, una respuesta del quiz):

```ts
export const AnswerBlockInput = z.object({
  position:   z.number().int().min(1).max(15), // qué pregunta: de la 1 a la 15
  mostKey:    z.enum(["a", "b", "c", "d"]),    // la opción que MÁS se le parece
  leastKey:   z.enum(["a", "b", "c", "d"]).nullable(), // la que MENOS; puede venir vacía
  shownOrder: z.string().regex(/^[abcd]{4}$/), // en qué orden se mostraron las 4 cartas
});
```

En palabras: "acepto un número de pregunta entre 1 y 15, una letra de la a a la d para
'más yo', opcionalmente otra letra para 'menos yo', y el orden en que aparecieron las
cartas". Nada más. Si llega `position: 16` o `mostKey: "z"`, se rechaza.

Los otros contratos son iguales de simples y están en `docs/form-response.md` §10:
`RegisterInput` (sala, nombre, género y fecha de nacimiento — más la foto, que va en el
mismo envío y la revisa el caso de uso) y `DeclaredInput`. Los de consentimiento y filtros
ya no existen: el D18 dejó de preguntar esas cosas.

## 5. La parte que confunde: ¿por qué guardamos letras y no el texto?

Cada persona recibe **sus propias 15 preguntas**: las escribe un modelo de lenguaje cuando
la persona entra, de cinco en cinco, y se guardan en la tabla `generated_blocks` (una fila
por persona y por posición 1..15). Lo que sí es igual para todo el mundo es la
**estructura**: 15 posiciones, 4 opciones por pregunta, una por rasgo, y exactamente una
"al revés". Si el modelo falla, se usan 15 preguntas fijas de respaldo que viven en el
código (`quiz/batch-*.json`, la constante `INSTRUMENT`). Una pregunta se ve así:

```json
{
  "id": 1,
  "scenario": "Tu amigo movió la perilla del horno y el pollo lleva una hora crudo. Los invitados ya están tocando el timbre.",
  "options": [
    { "key": "a", "text": "Sigo el plan: pollo tarde, pero pollo" },
    { "key": "b", "text": "Anuncio que la cena está oficialmente arruinada" },
    { "key": "c", "text": "Tomo el mando: pedimos pizza y listo" },
    { "key": "d", "text": "Culpo a la perilla, nunca a mi amigo" }
  ]
}
```

Cuando alguien responde la pregunta 1 eligiendo "pedimos pizza", el navegador **no
manda el texto**. Manda esto:

```json
{ "position": 1, "mostKey": "c", "leastKey": "b", "shownOrder": "cbad" }
```

- `position: 1` → "es la pregunta 1"
- `mostKey: "c"` → "la opción c de esa pregunta" (= pedimos pizza)
- `leastKey: "b"` → "la opción b" (= la cena está arruinada)
- `shownOrder: "cbad"` → "las cartas se le mostraron en el orden c, b, a, d" (las
  barajamos para cada persona, para que nadie aprenda el patrón)

¿Por qué letras? Tres razones:

1. Nadie puede "responder" con un texto que no existe en la pregunta.
2. Cada opción mide un rasgo de personalidad oculto (`pillar`) y eso **no debe salir al
   navegador**. Con letras, el navegador nunca se entera de qué mide cada carta.
3. Es más liviano: 100 personas × 15 preguntas × 4 textos sería guardar lo mismo 6.000
   veces.

## 6. Pero entonces, ¿cómo sé qué respondió cada uno? (esto es lo importante)

Aquí entra una decisión reciente (**D15** en `docs/domain.md`, issue #13): cuando el
servidor recibe las letras, **él mismo busca el texto** en la fila de `generated_blocks` de
esa persona y esa posición, y lo guarda junto con la respuesta. Si no existe esa fila (la
persona nunca vio ese bloque), la respuesta se rechaza. Entonces la fila en la base queda
así:

| columna | valor | de dónde sale |
| --- | --- | --- |
| `participant_id` | `01a0…` | de la cookie |
| `position` | `1` | lo que mandó el navegador |
| `most_key` | `c` | lo que mandó el navegador |
| `least_key` | `b` | lo que mandó el navegador |
| `shown_order` | `cbad` | lo que mandó el navegador |
| `instrument_version` | `v1` | qué versión de la **estructura** (15 posiciones, rotación, reglas) estaba activa |
| `scenario` | "Tu amigo movió la perilla del horno…" | **lo busca el servidor** |
| `most_text` | "Tomo el mando: pedimos pizza y listo" | **lo busca el servidor** |
| `least_text` | "Anuncio que la cena está oficialmente arruinada" | **lo busca el servidor** |

Y las preguntas completas de cada persona ya están en la base, en `generated_blocks`
(columna `options`, que guarda el JSON de arriba con las 4 opciones de cada pregunta).

Así que para **leer** lo que respondió una persona no necesitas el código ni un join:

```sql
select position, scenario, most_text, least_text
from quiz_responses
where participant_id = '01a02a27-7af6-7dfe-ac61-6a93bfef6c1a'
order by position;
```

```
position | scenario                                | most_text                             | least_text
---------+-----------------------------------------+---------------------------------------+-------------------------------------------------
1        | Tu amigo movió la perilla del horno…    | Tomo el mando: pedimos pizza y listo  | Anuncio que la cena está oficialmente arruinada
2        | Cuidas el gato de un amigo…             | Tapo el hueco con un cojín, me río    | Le recuerdo cada desastre suyo desde 2019
…
```

## 7. La consulta de asociación (cuando sí necesitas el join)

Hay una cosa que **a propósito** no va en la fila de respuesta: qué rasgo mide cada
opción (`pillar`) y si está "al derecho o al revés" (`keyed`). Eso sólo está dentro de
`generated_blocks.options`. Si lo necesitas (por ejemplo para depurar el puntaje), la
asociación es:

```
quiz_responses.participant_id  =  generated_blocks.participant_id   ← misma persona
quiz_responses.position        =  generated_blocks.position         ← misma pregunta
quiz_responses.most_key        =  opción.key                        ← misma opción
```

En SQL (Postgres; `options` es JSON, por eso se "desarma" con `jsonb_array_elements`):

```sql
select
  r.position,
  r.most_key,
  g.scenario,
  o ->> 'text'   as most_text,
  o ->> 'pillar' as pillar,   -- el rasgo que mide esa opción
  o ->> 'keyed'  as keyed     -- 'positive' o 'reversed'
from quiz_responses r
join generated_blocks g
  on g.participant_id = r.participant_id                 -- 1) misma persona
 and g.position       = r.position                       -- 2) misma pregunta
cross join lateral jsonb_array_elements(g.options) o     -- cada opción del bloque
where o ->> 'key' = r.most_key                           -- 3) misma opción
  and r.participant_id = '01a02a27-7af6-7dfe-ac61-6a93bfef6c1a'
order by r.position;
```

Léelo de abajo hacia arriba: "de las respuestas de esta persona, para cada una busca SU
bloque con el mismo número y, dentro de él, la opción con la misma letra; devuélveme su
texto, su rasgo y su dirección".

## 8. Cómo se atan las tablas (el dibujo completo)

```
rooms ──────────< participants >────── participant_sessions   (la cookie)
                      │
                      ├──────────────── romantic_gates        (0 o 1 fila)
                      ├──────────────── business_gates        (0 o 1 fila)
                      ├──────────────< generated_blocks       (las 15 preguntas DE ESA persona)
                      └──────────────< quiz_responses         (0 a 15 filas)
                                            │
                                            └── (participant_id, position, most_key)
                                                 ─────────────────────────────────────▶  generated_blocks.options
```

- Una flecha con `<` significa "muchos": un room tiene muchas personas; una persona
  tiene muchas respuestas.
- Las gates tienen fila **sólo si la persona aceptó ese lente y respondió**. Que no haya
  fila significa "no se le preguntó", y el sistema la deja fuera de ese ranking.

## 9. Reglas que siempre se cumplen (y quién las vigila)

| Regla | Quién la hace cumplir |
| --- | --- |
| Los tres consentimientos se escriben `true` al registrarse, y ninguna pantalla los menciona (D18) | el caso de uso `register-participant` + un test |
| Cada número de la ronda declarada está entre 0 y 3 | el contrato zod y un `check` en la base |
| Máximo 12 gustos, todos de la lista permitida | contrato + `check` |
| "Más yo" y "menos yo" no pueden ser la misma letra | contrato + `check` |
| Una sola respuesta por persona y pregunta (si vuelve atrás, se reemplaza) | `unique (participant_id, position)` |
| Cada respuesta apunta a un bloque que esa persona sí vio | el servidor rechaza la respuesta si no existe la fila en `generated_blocks` |
| Las preguntas de respaldo no cambian por accidente | un test que fija el "hash" de la constante `INSTRUMENT` |

## 10. Para probarlo con tus manos

1. `pnpm run db:migrate` crea las tablas en tu rama de base de datos (la de `.env`).
2. `pnpm run db:seed` crea el room del evento. Las preguntas de cada persona aparecen en
   `generated_blocks` cuando esa persona entra (o, en tests, cuando el fixture las guarda).
3. `pnpm run db:studio` abre un navegador de tablas: ahí verás `participants`,
   `quiz_responses`, etc., y podrás pegar las consultas de arriba.
4. Los tests de integración (`pnpm exec vitest run src/lib/adapters/db`) crean personas y
   respuestas de mentira en un room de prueba y las borran al terminar — es la forma más
   rápida de ver filas reales apareciendo.

## 11. Dónde está cada cosa en el código

| Qué | Archivo |
| --- | --- |
| Las 15 preguntas de respaldo | `quiz/batch-1.json`, `batch-2.json`, `batch-3.json` |
| La constante `INSTRUMENT` (estructura + respaldo) y sus validaciones | `src/lib/domain/quiz/instrument.ts` |
| Cómo se generan las preguntas de cada persona | `src/lib/use-cases/ensure-quiz-batch.ts`, `generate-quiz-batch.ts` |
| La tabla de preguntas generadas | `src/lib/adapters/db/schema/quiz.ts` (`generated_blocks`) |
| El tipo de una respuesta y sus reglas | `src/lib/domain/quiz/response.ts` |
| La persona, consentimientos, ronda declarada | `src/lib/domain/participant/participant.ts` |
| Los filtros (gates) | `src/lib/domain/participant/gates.ts` |
| Los gustos permitidos | `src/lib/domain/participant/tags.ts` |
| Las tablas (Drizzle) | `src/lib/adapters/db/schema/*.ts` |
| Cómo se guarda y se lee cada cosa | `src/lib/adapters/db/*-repository.ts` |
| Los contratos zod de cada paso | `docs/form-response.md` §10 (código en #6, #8, #9) |
| Las decisiones y el porqué de todo | `docs/domain.md` |
