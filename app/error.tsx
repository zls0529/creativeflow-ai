'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="fatal"><h1>The workspace couldn’t load.</h1><p>Please check the server and database, then try again.</p><button onClick={reset}>Try again</button></main>;
}
