# ¡Multiplica y vuela!

Juego web para aprender y practicar las tablas de multiplicar, pensado para niños de 7 a 10 años y para jugar en tablet o móvil en vertical.

## Jugar

Abre [el juego publicado](https://alejandrosuch.github.io/multiplica-y-vuela/). En la primera visita se abre una ventana para crear el perfil infantil; también puedes cerrarla y consultar las tablas sin perfil. **Otro niño** reutiliza la misma ventana para añadir perfiles. La opción principal, **Aprender mis tablas**, permite elegir tablas del 1 al 10 y propone 12 preguntas iniciales por sesión, sin reloj ni vidas. Las preguntas incluyen entre ocho y diez operaciones distintas y entre dos y cuatro repeticiones. Se reserva espacio para operaciones aún no vistas y se completa la sesión con repasos pendientes y las menos practicadas. Tras un error o una pista, la operación vuelve a aparecer después de al menos otras dos; esos reintentos pueden ampliar la sesión.

## Instalar en el móvil o la tableta

- **iPhone o iPad:** abre el juego en Safari, toca **Compartir** y elige **Añadir a pantalla de inicio**.
- **Android:** abre el juego en Chrome, toca el menú y elige **Instalar aplicación** o **Añadir a pantalla de inicio**.

Después de abrirlo una vez con conexión, el juego y sus sonidos también funcionan sin conexión. Al volver a abrir la aplicación o recuperar la conexión, se comprueba si hay una versión nueva; cuando está disponible, se descarga y la aplicación se recarga automáticamente. Si la dejas abierta, también se comprueba cada hora. El progreso y las puntuaciones siguen guardados en ese dispositivo.

El progreso se guarda por perfil y por multiplicación. Un acierto de memoria al primer intento programa repasos a partir de 1, 3, 7 y 14 días. La operación se marca como dominada al superar el último repaso. Un error o el uso de una pista deja la operación pendiente para el día siguiente. Al acabar se muestran las operaciones que han avanzado y las que necesitan más práctica.

Los modos de globos **Repaso** y **Calcula** siguen disponibles como juegos opcionales. Elige una o varias tablas del 1 al 10 y una dificultad.

Si solo quieres consultar, pulsa **Consulta las tablas a tu ritmo** en el inicio. Puedes ver las tablas del 1 al 10 sin empezar una partida.

- **Repaso:** toca el globo que tenga la respuesta correcta antes de que se escapen los tres globos.
- **Calcula:** escribe el resultado con el teclado numérico y pulsa **Validar**. Puedes pulsar **Borrar** para empezar la respuesta de nuevo; el tiempo sigue corriendo. También puedes usar las teclas numéricas, Retroceso y Entrar. Cada operación tiene una barra de tiempo: empieza en 18, 15 o 12 segundos según la dificultad y baja un 10 % cada diez aciertos, hasta un mínimo de tres segundos.

- Empiezas con cinco vidas. En Repaso, tocar una respuesta incorrecta o dejar que salgan los tres globos cuesta una vida. En Calcula, validar una respuesta incorrecta o agotar el tiempo cuesta una vida.
- Los globos ascienden a la misma velocidad desde alturas distintas y se balancean suavemente de lado a lado.
- La velocidad aumenta un 10 % cada diez aciertos, hasta un recorrido mínimo de cuatro segundos.
- Cada acierto suma `10 × multiplicador de dificultad + 5 × tramos de diez aciertos completados` puntos. Los multiplicadores son 1, 2 y 3 para fácil, medio y difícil.
- Las tablas se eligen con azar equilibrado: las menos usadas tienen más probabilidad y se evitan las repeticiones inmediatas. Las operaciones recientes tampoco se repiten si hay alternativas.
- Las partidas terminadas y las diez mejores puntuaciones **de cada modo** se guardan únicamente en el navegador donde juegas. Las puntuaciones anteriores a Calcula se conservan en Repaso. Los datos anteriores se migran a la versión con perfiles y mantienen las clasificaciones.

## Desarrollo

Requiere Node.js. Instala las dependencias y arranca Vite:

```sh
npm install
npm run dev
```

Comprobaciones:

```sh
npm test
npm run build
```

El despliegue a GitHub Pages se realiza automáticamente al actualizar la rama `main`.

## Fundamento didáctico

Un [estudio escolar sobre tablas de multiplicar](https://doi.org/10.1002/acp.4141) encontró mejores resultados con intentos de recordar y feedback que con recitación repetida. Una [revisión de estudios de matemáticas](https://doi.org/10.1007/s10648-025-10035-1) encontró beneficios al distribuir la práctica entre sesiones, aunque el efecto general de la recuperación activa en matemáticas fue menos concluyente. Los intervalos de 1, 3, 7 y 14 días son una decisión de diseño del juego.

## Licencia

El código, las ilustraciones originales y el sonido de estallido creado para este proyecto se distribuyen bajo la [licencia MIT](LICENSE), © 2026 Alejandro Such. Los recursos de terceros conservan sus propias condiciones, detalladas a continuación.

## Recursos

- Ilustraciones de escenario y Nubi: creadas para este proyecto en SVG.
- Fuente [Fredoka](https://github.com/google/fonts/tree/main/ofl/fredoka), bajo SIL Open Font License. Se incluye su licencia en `src/assets/OFL-Fredoka.txt`.
- Aplausos: extracto de 1,5 segundos de [Sound Effects - Applause after a concert](https://commons.wikimedia.org/wiki/File:Sound_Effects_-_Applause_after_a_concert.ogg), obra de Amada44 publicada bajo CC0 1.0. Se almacena una copia comprimida local para el juego.
- El efecto de estallido se genera localmente y se guarda como MP3; se reproduce igual que los aplausos. Los botones usan Web Audio.
