import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { kavaSlugSchema, type KavaSlugInput } from "@kava-now/shared";
import { api } from "../../lib/api";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

export function KavaSelectPage() {
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<KavaSlugInput>({
    resolver: zodResolver(kavaSlugSchema),
  });

  const onSubmit = async (data: KavaSlugInput) => {
    setChecking(true);
    setNotFound(false);
    try {
      const res = await api.get<{ exists: boolean }>(
        `/api/platform/kava-exists?slug=${encodeURIComponent(data.slug)}`,
      );
      if (res.exists) {
        window.location.href = `${window.location.protocol}//${data.slug}.${window.location.host}/login`;
      } else {
        setNotFound(true);
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 text-center">Βρείτε την κάβα σας</h2>

      <Input
        id="slug"
        type="text"
        label="Όνομα κάβας"
        placeholder="my-kava"
        error={errors.slug?.message || (notFound ? "Κάβα δεν βρέθηκε" : undefined)}
        {...register("slug")}
      />

      <Button type="submit" className="w-full" loading={checking}>
        Συνέχεια
      </Button>
    </form>
  );
}
