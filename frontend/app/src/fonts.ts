/**
 * Tipografías autoalojadas (paquetes @fontsource, licencia SIL OFL 1.1).
 *
 * Antes se pedían a fonts.googleapis.com / fonts.gstatic.com: cada vez que un analista abría
 * la consola, Google recibía su IP, su navegador y la hora (y la consola no funcionaba igual
 * sin Internet). Ahora Vite empaqueta los .woff2 junto al resto de la aplicación y se sirven
 * desde el mismo origen. Cada @font-face lleva `unicode-range`: el navegador solo descarga
 * los pesos y alfabetos que la página usa de verdad.
 */
import "@fontsource/rajdhani/400.css";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/jetbrains-mono/800.css";
import "@fontsource/share-tech-mono/400.css"; // intro cinemática (antes caía en la fuente monoespaciada del sistema)
