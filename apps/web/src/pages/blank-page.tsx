export function BlankPage() {
  return (
    <div className="flex min-h-[calc(100vh-5.5rem)] items-center justify-center p-6 md:min-h-[calc(100vh-4.5rem)]">
      <div className="w-full max-w-2xl rounded-2xl border border-dashed border-border bg-card/50 px-6 py-20 text-center">
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      </div>
    </div>
  );
}
