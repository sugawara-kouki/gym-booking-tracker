export const Login = () => {
  return (
    <article style={{ maxWidth: '400px', margin: '100px auto' }}>
      <header>
        <h2 style={{ textAlign: 'center', margin: 0 }}>ログイン</h2>
      </header>
      <div style={{ padding: '20px 0' }}>
        <p style={{ textAlign: 'center', marginBottom: '30px' }}>
          Gym Booking Tracker を利用するには、Googleアカウントでログインしてください。
        </p>
        <a
          href="/auth/google"
          role="button"
          class="contrast"
          style={{ width: '100%', display: 'block', textAlign: 'center' }}
        >
          Googleでログイン
        </a>
      </div>
    </article>
  )
}
