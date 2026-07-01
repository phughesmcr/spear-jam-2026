import { define } from "../utils.ts";

export default define.page(function App({ Component }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover"
        />
        <title>Spear of Destiny | 30 DAYS OF RPG ADVENTURES #1</title>
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
});
