import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <p className="font-mono text-xs text-accent">404</p>
      <h1 className="mt-2 text-lg font-semibold">Nothing here</h1>
      <p className="mt-1 text-sm text-muted">It doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <ButtonLink href="/" className="mt-4">
        Back to Studio
      </ButtonLink>
    </div>
  );
}
