import type { Child } from 'hono/jsx'

type LayoutProps = {
  children: Child
}

export const DefaultLayout = ({ children }: LayoutProps) => {
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Gym Tracker</title>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css"
        />
      </head>
      <body>
        <main class="container">{children}</main>
      </body>
    </html>
  )
}
