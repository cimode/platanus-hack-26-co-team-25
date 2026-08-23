# Guía del formulario, explicada desde cero

> Para quien llega nuevo al proyecto. Aquí no hay teoría: sólo qué datos entran, dónde
> se guardan y cómo se relacionan entre sí. Los detalles técnicos están en
> `docs/domain.md` y `docs/form-response.md`; esta guía es el mapa para entenderlos.

---

## 1. La idea en una frase

Cada persona del evento llena un formulario en su celular. Nosotros guardamos lo que
responde, y con eso el sistema calcula con quién es compatible. Esta guía explica
**cómo se guarda lo que responde**.

## 2. El formulario no es uno, son dos

Desde el **D20** (23-08-2026) el formulario es lo más corto posible: una sola pantalla de
registro y, apenas se envía, las preguntas. Cada respuesta se guarda en el momento, así
que si alguien cierra la pestaña, lo anterior queda.

| Paso | Qué pregunta | Dónde se guarda |
| --- | --- | --- |
| 1 · registro | foto, nombre, género y fecha de nacimiento, todo junto, más la casilla de tratamiento de datos | tabla `participants` (se crea la fila, con `photo_url`, `gender`, `birthdate`, `data_consent_at` y los tres consentimientos en `true`) |
| 2 · quiz | 12 situaciones, cada una con 4 opciones; la persona toca la que más se le parece | tabla `quiz_responses` (**una fila por pregunta respondida**, hasta 12) |

Lo que ya no se pregunta: el consentimiento (participar *es* consentir en esta versión),
el equipo y el track, los filtros de cada lente, la banda de edad — esa se calcula sola
a partir de la fecha de nacimiento — y, desde el D20, la **ronda declarada** (las seis
preguntas de bolsillo, arraigo, familia, horas, distancia y horario). Sus columnas siguen
en `participants` pero quedan vacías; nada las exige. Ninguna pantalla dice qué se está
midiendo: no hay títulos de categoría, no hay "Paso 4 de 5" y no hay marca de agua; sólo
una barra de progreso que cubre los 13 pasos del recorrido (1 registro + 12 bloques).

### ¿Y de dónde salen las preguntas tan rápido?

De un archivo. Nada se escribe mientras la persona espera — esa es toda la idea del **D21**.

Antes las 15 preguntas de cada persona las escribía un modelo mientras ella miraba una
pantalla que decía "estamos escribiendo tus preguntas". Eso se leía como una app rota y la
gente cerraba la pestaña, así que se borró completo. Hoy:

1. Hay un **banco** de 400 preguntas ya escritas, revisadas y guardadas en el repositorio:
   `quiz/bank/regulation.json`, `politeness.json`, `reliability.json` y `agency.json`, 100
   en cada uno. Se escribieron una sola vez, fuera de la app.
2. Al registrarse, la función `formFor(participantId)` le **reparte 12** a esa persona —
   tres de cada rasgo — usando su propio id como semilla. El mismo id siempre saca las
   mismas 12 en el mismo orden, y el orden de los rasgos cambia de persona a persona, así
   que a dos personas no les toca lo mismo en la misma posición.
3. Esas 12 se guardan de una vez en `generated_blocks` (una sola escritura) antes de que el
   navegador llegue al quiz. Por eso la primera pregunta aparece de inmediato: ya estaba
   escrita, y mostrarla no cuesta ni una llamada al modelo.

Para agregar preguntas al banco se escriben aparte, se dejan en `quiz/bank/.parts/` y se
corre `node scripts/quiz-bank/merge.mjs --write`, que revisa cada una (estructura, largo,
voz, repetidas) y sólo deja pasar las que cumplen. Está explicado en
`docs/quiz-generation.md`.

## 3. ¿Cómo sabemos quién es quién? (la cookie)

No hay login ni contraseña. En el paso 1 el servidor crea la persona y le da a su
navegador una **cookie** llamada `dipia_session` con un código largo al azar (un
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

Así se lee un contrato (paso 2, una respuesta del quiz):

```ts
export const AnswerBlockInput = z.object({
  position:   z.number().int().min(1).max(12), // qué pregunta: de la 1 a la 12
  mostKey:    z.enum(["a", "b", "c", "d"]),    // la opción que MÁS se le parece
  leastKey:   z.enum(["a", "b", "c", "d"]).nullable(), // la que MENOS; sólo en el modo de dos marcas
  shownOrder: z.string().regex(/^[abcd]{4}$/), // en qué orden se mostraron las 4 cartas
});
```

En palabras: "acepto un número de pregunta entre 1 y 12, una letra de la a a la d para
'más yo', opcionalmente otra letra para 'menos yo', y el orden en que aparecieron las
cartas". Nada más. Si llega `position: 13` o `mostKey: "z"`, se rechaza.

El otro contrato es igual de simple y está en `docs/form-response.md` §10:
`RegisterInput` (sala, nombre, género, fecha de nacimiento y la casilla de datos — más la
foto, que va en el mismo envío y la revisa el caso de uso). Los de consentimiento,
filtros y ronda declarada ya no existen: el D18 y el D20 dejaron de preguntar esas cosas.

## 5. La parte que confunde: ¿por qué guardamos letras y no el texto?

Cada persona recibe **sus propias 12 preguntas**: se las reparte el banco cuando se
registra, y se guardan en la tabla `generated_blocks` (una fila por persona y por posición
1..12). Lo que sí es igual para todo el mundo es la **estructura**: 12 posiciones, 4
opciones por pregunta, una por rasgo, y exactamente una "al revés". La constante
`INSTRUMENT` (versión `bank-1`) es esa estructura, y `validateBlock()` la revisa en cada
una de las 400 preguntas del banco al arrancar la app: si alguna está mal, la app no
arranca. Una pregunta se ve así:

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
{ "position": 1, "mostKey": "c", "leastKey": null, "shownOrder": "cbad" }
```

- `position: 1` → "es la pregunta 1"
- `mostKey: "c"` → "la opción c de esa pregunta" (= pedimos pizza)
- `leastKey: null` → en el modo normal sólo se toca una carta
- `shownOrder: "cbad"` → "las cartas se le mostraron en el orden c, b, a, d" (las
  barajamos para cada persona, para que nadie aprenda el patrón)

¿Por qué letras? Tres razones:

1. Nadie puede "responder" con un texto que no existe en la pregunta.
2. Cada opción mide un rasgo de personalidad oculto (`pillar`) y eso **no debe salir al
   navegador**. Con letras, el navegador nunca se entera de qué mide cada carta.
3. Es más liviano: 100 personas × 12 preguntas × 4 textos sería guardar lo mismo 4.800
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
| `least_key` | `null` | lo que mandó el navegador |
| `shown_order` | `cbad` | lo que mandó el navegador |
| `instrument_version` | `bank-1` | qué versión de la **estructura** (12 posiciones, reglas) estaba activa |
| `scenario` | "Tu amigo movió la perilla del horno…" | **lo busca el servidor** |
| `most_text` | "Tomo el mando: pedimos pizza y listo" | **lo busca el servidor** |
| `least_text` | `null` | **lo busca el servidor** (cuando hay `least_key`) |

Y las preguntas completas de cada persona ya están en la base, en `generated_blocks`
(columna `options`, que guarda el JSON de arriba con las 4 opciones de cada pregunta).

Así que para **leer** lo que respondió una persona no necesitas el código ni un join:

```sql
select position, scenario, most_text
from quiz_responses
where participant_id = '01a02a27-7af6-7dfe-ac61-6a93bfef6c1a'
order by position;
```

```
position | scenario                                | most_text
---------+-----------------------------------------+---------------------------------------
1        | Tu amigo movió la perilla del horno…    | Tomo el mando: pedimos pizza y listo
2        | Cuidas el gato de un amigo…             | Tapo el hueco con un cojín, me río
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
quiz/bank/*.json  (400 preguntas en el repositorio; formFor(id) reparte 12)
        │
        ▼
rooms ──────────< participants >────── participant_sessions   (la cookie)
                      │
                      ├──────────────── romantic_gates        (0 o 1 fila; ya no se escribe)
                      ├──────────────── business_gates        (0 o 1 fila; ya no se escribe)
                      ├──────────────< generated_blocks       (las 12 preguntas DE ESA persona)
                      └──────────────< quiz_responses         (0 a 12 filas)
                                             │
                                             └── (participant_id, position, most_key)
                                               ─────────────────────────────────────▶  generated_blocks.options
```

- Una flecha con `<` significa "muchos": un room tiene muchas personas; una persona
  tiene muchas respuestas.
- Las gates y la ronda declarada ya no se preguntan. Una persona registrada — foto,
  género, fecha — ya puede entrar en el ranking; lo que no respondió cuenta como "no
  medido", nunca como cero.

## 9. Reglas que siempre se cumplen (y quién las vigila)

| Regla | Quién la hace cumplir |
| --- | --- |
| Los tres consentimientos se escriben `true` al registrarse, y ninguna pantalla los menciona (D18) | el caso de uso `register-participant` + un test |
| Nadie se registra sin marcar la casilla de tratamiento de datos, y se guarda **cuándo** la marcó (#49) | el caso de uso rechaza antes de escribir nada |
| Una persona registrada va directo a las preguntas; sin foto o sin identidad vuelve al registro (D20) | `intakeStepOf` + un test |
| "Más yo" y "menos yo" no pueden ser la misma letra | contrato + `check` |
| Una sola respuesta por persona y pregunta (si vuelve atrás, se reemplaza) | `unique (participant_id, position)` |
| Cada respuesta apunta a un bloque que esa persona sí vio | el servidor rechaza la respuesta si no existe la fila en `generated_blocks` |
| Registrarse dos veces no crea dos formularios | `saveBatch` reescribe las mismas 12 filas (`unique (participant_id, position)`) |
| Las 400 preguntas del banco cumplen la estructura | `validateBlock()` sobre todas al importar: si una falla, la app no arranca |
| Las preguntas fijas del código no cambian por accidente | un test que fija el "hash" de la constante `INSTRUMENT` |

## 10. Para probarlo con tus manos

1. `pnpm run db:migrate` crea las tablas en tu rama de base de datos (la de `.env`).
2. `pnpm run db:seed` crea el room del evento. Las 12 preguntas de cada persona aparecen en
   `generated_blocks` en el momento en que se registra (o, en tests, cuando el fixture las
   guarda con el mismo `formFor`).
3. `pnpm run db:studio` abre un navegador de tablas: ahí verás `participants`,
   `quiz_responses`, etc., y podrás pegar las consultas de arriba.
4. Los tests de integración (`pnpm exec vitest run src/lib/adapters/db`) crean personas y
   respuestas de mentira en un room de prueba y las borran al terminar — es la forma más
   rápida de ver filas reales apareciendo.

## 11. Dónde está cada cosa en el código

| Qué | Archivo |
| --- | --- |
| El banco de 400 preguntas | `quiz/bank/regulation.json`, `politeness.json`, `reliability.json`, `agency.json` |
| El script que arma el banco desde los borradores | `scripts/quiz-bank/merge.mjs` (ver `docs/quiz-generation.md`) |
| Cargar el banco, validarlo y repartir las 12 (`formFor`) | `src/lib/domain/quiz/bank.ts` |
| La constante `INSTRUMENT` (la estructura) y sus validaciones | `src/lib/domain/quiz/instrument.ts` |
| Guardar las 12 preguntas de una persona | `src/lib/use-cases/assign-quiz-form.ts` |
| La tabla de las preguntas de cada persona | `src/lib/adapters/db/schema/quiz.ts` |
| El tipo de una respuesta y sus reglas | `src/lib/domain/quiz/response.ts` |
| La persona y sus consentimientos; a qué pantalla vuelve | `src/lib/domain/participant/participant.ts`, `flow.ts` |
| El piso (quién puede entrar al ranking) | `src/lib/domain/participant/floor.ts` |
| Los filtros (gates) que se derivan solos | `src/lib/domain/participant/mvp-defaults.ts` |
| Las tablas (Drizzle) | `src/lib/adapters/db/schema/*.ts` |
| Cómo se guarda y se lee cada cosa | `src/lib/adapters/db/*-repository.ts` |
| Los contratos zod de cada paso | `docs/form-response.md` §10 (código en `src/app/intake/actions.ts` y `src/app/quiz/actions.ts`) |
| Las decisiones y el porqué de todo | `docs/domain.md` |
