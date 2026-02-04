export default function SharedSessionPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Shared session</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>Session: {sessionId}</p>
    </main>
  );
}
