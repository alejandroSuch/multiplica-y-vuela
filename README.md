# ¡Multiplica y vuela!

Juego web de globos para practicar las tablas de multiplicar, pensado para niños de 7 a 10 años y para jugar en tablet o móvil en vertical.

## Jugar

Abre [el juego publicado](https://alejandrosuch.github.io/multiplica-y-vuela/), escribe tu nombre, elige una o varias tablas del 1 al 9 y una velocidad. Toca el globo que tenga la respuesta correcta.

- Empiezas con cinco vidas. Tocar una respuesta incorrecta o dejar que salgan los tres globos cuesta una vida.
- Los globos ascienden a la misma velocidad desde alturas distintas y se balancean suavemente de lado a lado.
- La velocidad aumenta un 10 % cada diez aciertos, hasta un recorrido mínimo de cuatro segundos.
- Cada acierto suma `10 × multiplicador de dificultad + 5 × tramos de diez aciertos completados` puntos. Los multiplicadores son 1, 2 y 3 para fácil, medio y difícil.
- Las tablas se eligen con azar equilibrado: las menos usadas tienen más probabilidad y se evitan las repeticiones inmediatas. Las operaciones recientes tampoco se repiten si hay alternativas.
- Las partidas terminadas y las diez mejores puntuaciones se guardan únicamente en el navegador donde juegas.

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

## Recursos

- Ilustraciones de escenario y Nubi: creadas para este proyecto en SVG.
- Fuente [Fredoka](https://github.com/google/fonts/tree/main/ofl/fredoka), bajo SIL Open Font License. Se incluye su licencia en `src/assets/OFL-Fredoka.txt`.
- Aplausos: extracto de 1,5 segundos de [Sound Effects - Applause after a concert](https://commons.wikimedia.org/wiki/File:Sound_Effects_-_Applause_after_a_concert.ogg), obra de Amada44 publicada bajo CC0 1.0. Se almacena una copia comprimida local para el juego.
- Los efectos de estallido y botones se generan con Web Audio.
