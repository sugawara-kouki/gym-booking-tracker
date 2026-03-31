import { jsxRenderer } from 'hono/jsx-renderer'
import { DefaultLayout } from './layouts/DefaultLayout'

export const renderer = jsxRenderer(({ children }) => {
  return <DefaultLayout>{children}</DefaultLayout>
})
