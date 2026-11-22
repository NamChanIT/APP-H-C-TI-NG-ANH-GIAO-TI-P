import './style.css';

export const metadata = {
  title: 'SpeakMate AI — Speaking Studio',
  description: 'Practise real English conversations with an AI speaking partner.'
};

export default function Layout({ children }) {
  return <html lang="en"><body>
    {process.env.NEXT_PUBLIC_SPEAKMATE_DEMO === 'true' && <aside className="render-demo-notice" aria-label="Demo storage">
      Free demo. Without an external backup, accounts, conversations and review cards reset when the server sleeps, restarts or redeploys.
    </aside>}
    {children}
  </body></html>;
}
