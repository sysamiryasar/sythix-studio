"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

export function MinecraftUnlink() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Unlink</Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Unlink Minecraft account?"
        description="Your profile stops showing the verified Minecraft name and skin. You can link again later."
        confirmLabel="Unlink"
        danger
        onConfirm={async () => {
          await api("/api/v1/nexus/minecraft", { method: "DELETE" });
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
