# dipia

**Simula la vida que aún no ha pasado con la gente que ya está en tu misma sala.**

En cualquier sala —una hackathon, una conferencia, un coworking— hay decenas de
personas que deberían conocerse. Están a metros de distancia durante horas y
salen de ahí siendo desconocidas.

dipia no es otra app de citas. Es un **motor de simulación de relaciones
humanas**: modela a cada persona de la sala, calcula qué tan compatible es con
todas las demás bajo el lente que elijas, y después **simula la vida compartida**
con la que elijas. Esa simulación es la excusa para ir a saludar.

---

## Cómo funciona

### 1. El cuestionario

Cada persona responde **12 bloques de elección forzada**. En cada bloque hay
cuatro opciones y hay que elegir la que más te representa y la que menos.

Dos decisiones importantes:

- **Emparejamiento por deseabilidad** — las cuatro opciones de un bloque suenan
  igual de bien. No hay una respuesta "correcta" que uno pueda actuar.
- **Clave mixta** — exactamente una opción por bloque está invertida, así que
  responder en piloto automático no produce un perfil coherente.

Los bloques salen de un **banco de 400 preguntas comprometido en el repositorio**
(100 por rasgo, escritas y validadas fuera de línea). A cada persona se le reparten
doce de forma determinista a partir de su id — tres por rasgo, en un orden propio —,
así que dos personas casi nunca ven la misma secuencia y **ninguna pregunta cuesta
una llamada a un modelo**. Nadie espera a que se escriba nada.

### 2. El avatar

De esas 12 elecciones el sistema estima **cuatro rasgos latentes**:

| Rasgo | Qué mide |
| --- | --- |
| **Regulación** | Cuánta angustia genera y arrastra una persona, y qué tan rápido vuelve a su línea base |
| **Cortesía** | Contención habitual frente al desprecio, la crítica y la descalificación |
| **Fiabilidad** | Cumplimiento de lo prometido bajo aburrimiento y bajo adversidad |
| **Agencia** | Quién toma el volante cuando genuinamente no está claro quién debería |

La estimación es **MAP bayesiano bajo un modelo Thurstoniano de elección**, con
parámetros de ítem autorados. No es un promedio de respuestas: cada estimación
llega con su incertidumbre, y un cuestionario incompleto no escribe filas —
queda como no medido, con su prior, y el motor lo trata como tal.

A eso se suma un canal **declarado**: postura frente al dinero, arraigo,
gravedad familiar, horas disponibles, distancia y cronotipo. Cosas que no tiene
sentido inferir cuando se pueden preguntar.

### 3. El ranking

Elegís un lente y dipia ordena la sala entera:

- 💼 **Sociedad** — compatibilidad como socios o cofundadores
- ❤️ **Pareja** — compatibilidad romántica
- 🤝 **Amistad** — compatibilidad como amigos

**Cada lente es un modelo distinto**, no el mismo puntaje con otro nombre. Tiene
su propio vector de pesos, su propia forma de combinar los rasgos —mínimo suave
en pareja, mínimo duro de Fiabilidad en sociedad, media simple en amistad— y sus
propios filtros declarados. La misma sala se reordena por completo al cambiar de
lente.

### 4. La vida simulada

Acá está el producto. Elegís a alguien del ranking y dipia genera **la línea de
tiempo de la vida que compartirían**: los años, los eventos, la fricción que les
tocaba, y el final si es que hay uno.

La estructura es **determinista y sembrada**, no improvisada:

1. **Esqueleto temporal** — el horizonte sale del lente; la ruptura, cuando
   ocurre, se muestrea de una curva de riesgo amortiguada por la similitud real
   del par.
2. **Arco de fricción obligatorio** — el término de fricción que el puntaje
   marcó elige su dominio, y el choque cae dentro de la ventana de riesgo.
3. **Arcos cálidos** — patrón × dominio × desenlace, muestreados con pesos
   condicionados a los drivers reales del par.
4. **Extras con compuerta** — el arco de hijos exige que ambos quieran y ambos
   hayan consentido, y que la relación siga viva ese año.
5. **Realización cronológica** con estado del mundo hilado hacia adelante: un
   evento del año 6 sabe lo que pasó en el año 2.

**El modelo de lenguaje narra; no decide.** Puede *proponer* un arco extra, pero
solo el código lo *admite*, y únicamente si la razón que alega —"este driver",
"esta fricción", "esta bandera"— existe de verdad en el puntaje de ese par. Si
no la puede justificar, el arco se descarta y la línea de tiempo sale sin él.

Eso es lo que sostiene la coherencia. Una línea de tiempo que se contradice mata
la ilusión en un segundo, y la única forma de garantizar que no pase es que la
estructura no dependa de la buena voluntad del narrador.

---

## Seguridad y consentimiento

Se están rankeando personas reales, con sus caras, delante de sus pares. Eso se
diseñó explícitamente:

- **Consentimiento por lente** en el cuestionario. Sin consentimiento para un
  lente, la persona no aparece en ese ranking.
- **Cada ranking es privado** — visible solo para quien lo pidió. No hay URL que
  permita ver el ranking de otro.
- **Solo los matches mutuos** se muestran en la vista pública de la sala.
- **El arco de hijos tiene doble compuerta** — ambos deben quererlo y ambos
  deben haberlo consentido.
- Hasta el momento del reveal, el sitio entero vive detrás de una contraseña
  compartida.

---

## Arquitectura

**Puertos y adaptadores.** El dominio —el instrumento, el estimador, el motor de
compatibilidad, la gramática de la línea de tiempo— no conoce ni la base de
datos ni el proveedor del modelo. Todo I/O entra por un puerto, y cada puerto
tiene un doble determinista.

Eso es lo que hace testeable la mitad determinista del sistema: el estimador de
latentes, los vectores de peso por lente, las compuertas de consentimiento y la
gramática de eventos se prueban sin red y sin base de datos. La única parte no
determinista es la prosa.

| Capa | Tecnología |
| --- | --- |
| App | Next.js 16 (App Router, Server Components y Server Actions), React 19 |
| UI | Tailwind CSS v4 (CSS-first `@theme`), shadcn/ui sobre Radix |
| Datos | Lakebase Postgres en Neon, Drizzle ORM |
| Fotos | Neon Object Storage (S3-compatible, ramifica junto con la base) |
| Modelo | Vercel AI Gateway → `anthropic/claude-sonnet-5` |
| Tests | Vitest (unitarios + integración) y Playwright (end-to-end) |
| Deploy | Vercel |

Hay un sistema de diseño real detrás, no CSS improvisado: todos los tokens viven
en un solo archivo y hay una referencia viva navegable en `/design`.

---

## El equipo

**team-25 · Platanus Hack 26 — Bogotá · Track 🌐 Simulaciones**

- Cristian Moreno ([@cimode](https://github.com/cimode))
- Juan Pablo Bautista Cala ([@bacaxnot](https://github.com/bacaxnot))
- Robinson Brito ([@RABrL](https://github.com/RABrL))

🔗 **[www.dipia.lat](https://www.dipia.lat)**
