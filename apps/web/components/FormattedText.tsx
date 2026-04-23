export default function FormattedText({ text }: { text: string }) {
  const lines = text.split(/\n+/).filter((line) => line.trim().length > 0);

  return (
    <div className="space-y-2 text-sm leading-6 text-inherit">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("- ")) {
          return (
            <p key={`${trimmed}-${index}`} className="pl-3">
              <span className="mr-2 text-road/40">•</span>
              {formatInline(trimmed.slice(2))}
            </p>
          );
        }
        return <p key={`${trimmed}-${index}`}>{formatInline(trimmed)}</p>;
      })}
    </div>
  );
}

function formatInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}
