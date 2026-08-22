# Guía del formulario, explicada desde cero

> Para quien llega nuevo al proyecto. Aquí no hay teoría: sólo qué datos entran, dónde
> se guardan y cómo se relacionan entre sí. Los detalles técnicos están en
> `docs/domain.md` y `docs/form-response.md`; esta guía es el mapa para entenderlos.

---

## 1. La idea en una frase

Cada persona del evento llena un formulario en su celular. Nosotros guardamos lo que
responde, y con eso el sistema calcula con quién es compatible. Esta guía explica
**cómo se guarda lo que responde**.

## 2. El formulario no es uno, son siete

Parece un solo formulario, pero por dentro son **siete envíos** pequeños, uno detrás de
otro. Cada envío se guarda apenas la persona toca "siguiente". ¿Por qué así? Porque si
alguien se aburre y cierra el celular en el paso 5, **no perdemos** los pasos 1 al 4.

```
1. registro  →  2. foto  →  3. consentimiento  →  4. ronda declarada  →  5. filtros  →  6. quiz (15 preguntas)  →  listo
```

| Paso | Qué pregunta | Dónde se guarda |
| --- | --- | --- |
| 1 · registro | nombre, equipo, track | tabla `participants` (se crea la fila) |
| 2 · foto | una foto real | `participants.photo_url` |
| 3 · consentimiento | "¿quieres entrar al ranking romántico / de negocios / de amistad?" (los tres apagados por defecto) | `participants.consent_romantic`, `consent_business`, `consent_friendship` |
| 4 · ronda declarada | seis preguntas de "¿cuánto…?" con 4 opciones cada una (0 a 3), y una lista de gustos | `participants.money_posture` … `participants.chronotype`, `participants.tags` |
| 5 · filtros | sólo si dijo que sí a romántico: género, a quién le interesa, soltería, edad, hijos. Sólo si dijo que sí a negocios: riesgo, horizonte, líneas rojas | tabla `romantic_gates` / tabla `business_gates` (una fila por persona, **y sólo si respondió**) |
| 6 · quiz | 15 situaciones, cada una con 4 opciones; la persona marca la que más se le parece y la que menos | tabla `quiz_responses` (**una fila por pregunta respondida**, hasta 15) |

Todo esto cuelga de la persona, y la persona cuelga de un **room** (el evento). Un room
es "Platanus Hack 26 Bogotá"; los tests usan rooms de prueba para no mezclarse con los
datos reales.

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

Así se lee un contrato (paso 6, una respuesta del quiz):

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
`RegisterInput`, `ConsentInput`, `DeclaredInput`, `RomanticGateInput`,
`BusinessGateInput`.

## 5. La parte que confunde: ¿por qué guardamos letras y no el texto?

Las 15 preguntas del quiz con sus 4 opciones son **siempre las mismas para todo el
mundo**. Viven en un archivo del código (`quiz/batch-1.json`, `batch-2.json`,
`batch-3.json`) y se cargan como una constante llamada `INSTRUMENT`. Una pregunta se ve
así:

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
servidor recibe las letras, **él mismo busca el texto** en `INSTRUMENT` y lo guarda
junto con la respuesta. Entonces la fila en la base queda así:

| columna | valor | de dónde sale |
| --- | --- | --- |
| `participant_id` | `01a0…` | de la cookie |
| `position` | `1` | lo que mandó el navegador |
| `most_key` | `c` | lo que mandó el navegador |
| `least_key` | `b` | lo que mandó el navegador |
| `shown_order` | `cbad` | lo que mandó el navegador |
| `instrument_version` | `v1` | qué versión de las preguntas estaba activa |
| `scenario` | "Tu amigo movió la perilla del horno…" | **lo busca el servidor** |
| `most_text` | "Tomo el mando: pedimos pizza y listo" | **lo busca el servidor** |
| `least_text` | "Anuncio que la cena está oficialmente arruinada" | **lo busca el servidor** |

Y las preguntas completas también se copian a la base, una vez, en la tabla
`instruments` (columna `blocks`, que guarda el JSON de arriba con las 15 preguntas).

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
`instruments.blocks`. Si lo necesitas (por ejemplo para depurar el puntaje), la
asociación es:

```
quiz_responses.instrument_version  =  instruments.version        ← misma versión de preguntas
quiz_responses.position            =  bloque.position             ← misma pregunta
quiz_responses.most_key            =  opción.key                  ← misma opción
```

En SQL (Postgres; `blocks` es JSON, por eso se "desarma" con `jsonb_array_elements`):

```sql
select
  r.position,
  r.most_key,
  b ->> 'scenario' as scenario,
  o ->> 'text'     as most_text,
  o ->> 'pillar'   as pillar,   -- el rasgo que mide esa opción
  o ->> 'keyed'    as keyed     -- 'positive' o 'reversed'
from quiz_responses r
join instruments i
  on i.version = r.instrument_version                    -- 1) misma versión
cross join lateral jsonb_array_elements(i.blocks)       b -- cada bloque del JSON
cross join lateral jsonb_array_elements(b -> 'options') o -- cada opción del bloque
where (b ->> 'position')::int = r.position               -- 2) misma pregunta
  and o ->> 'key' = r.most_key                           -- 3) misma opción
  and r.participant_id = '01a02a27-7af6-7dfe-ac61-6a93bfef6c1a'
order by r.position;
```

Léelo de abajo hacia arriba: "de las respuestas de esta persona, para cada una busca el
bloque con el mismo número y, dentro de él, la opción con la misma letra; devuélveme su
texto, su rasgo y su dirección".

## 8. Cómo se atan las tablas (el dibujo completo)

```
rooms ──────────< participants >────── participant_sessions   (la cookie)
                      │
                      ├──────────────── romantic_gates        (0 o 1 fila)
                      ├──────────────── business_gates        (0 o 1 fila)
                      └──────────────< quiz_responses         (0 a 15 filas)
                                            │
                                            └── (instrument_version, position, most_key)
                                                 ─────────────────────────────────────▶  instruments.blocks
```

- Una flecha con `<` significa "muchos": un room tiene muchas personas; una persona
  tiene muchas respuestas.
- Las gates tienen fila **sólo si la persona aceptó ese lente y respondió**. Que no haya
  fila significa "no se le preguntó", y el sistema la deja fuera de ese ranking.

## 9. Reglas que siempre se cumplen (y quién las vigila)

| Regla | Quién la hace cumplir |
| --- | --- |
| Los tres consentimientos empiezan en `false` | la base (valor por defecto) + un test que corre siempre |
| Cada número de la ronda declarada está entre 0 y 3 | el contrato zod y un `check` en la base |
| Máximo 12 gustos, todos de la lista permitida | contrato + `check` |
| "Más yo" y "menos yo" no pueden ser la misma letra | contrato + `check` |
| Una sola respuesta por persona y pregunta (si vuelve atrás, se reemplaza) | `unique (participant_id, position)` |
| Sólo se aceptan filtros del lente que la persona aceptó | el caso de uso lo rechaza |
| Las preguntas no cambian una vez que alguien respondió | un test que fija el "hash" del instrumento + el servidor se niega a sembrar una versión distinta |

## 10. Para probarlo con tus manos

1. `pnpm run db:migrate` crea las tablas en tu rama de base de datos (la de `.env`).
2. `pnpm run db:seed` crea el room del evento y copia las preguntas a `instruments`.
3. `pnpm run db:studio` abre un navegador de tablas: ahí verás `participants`,
   `quiz_responses`, etc., y podrás pegar las consultas de arriba.
4. Los tests de integración (`pnpm exec vitest run src/lib/adapters/db`) crean personas y
   respuestas de mentira en un room de prueba y las borran al terminar — es la forma más
   rápida de ver filas reales apareciendo.

## 11. Dónde está cada cosa en el código

| Qué | Archivo |
| --- | --- |
| Las 15 preguntas | `quiz/batch-1.json`, `batch-2.json`, `batch-3.json` |
| La constante `INSTRUMENT` y sus validaciones | `src/lib/domain/quiz/instrument.ts` |
| El tipo de una respuesta y sus reglas | `src/lib/domain/quiz/response.ts` |
| La persona, consentimientos, ronda declarada | `src/lib/domain/participant/participant.ts` |
| Los filtros (gates) | `src/lib/domain/participant/gates.ts` |
| Los gustos permitidos | `src/lib/domain/participant/tags.ts` |
| Las tablas (Drizzle) | `src/lib/adapters/db/schema/*.ts` |
| Cómo se guarda y se lee cada cosa | `src/lib/adapters/db/*-repository.ts` |
| Los contratos zod de cada paso | `docs/form-response.md` §10 (código en #6, #8, #9) |
| Las decisiones y el porqué de todo | `docs/domain.md` |
