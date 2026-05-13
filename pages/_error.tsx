import type { NextPageContext } from 'next'

type ErrorProps = {
  statusCode?: number
}

function ErrorPage({ statusCode }: ErrorProps) {
  return (
    <div style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h1>{statusCode ? `Error ${statusCode}` : 'An error occurred'}</h1>
      <p>Please try again.</p>
    </div>
  )
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default ErrorPage
