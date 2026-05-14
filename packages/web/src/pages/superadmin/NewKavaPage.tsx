import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, Link } from "react-router";
import { registerSchema, type RegisterInput } from "@kava-now/shared";
import { useCreateKava } from "../../lib/hooks/use-superadmin-kavas";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

export function NewKavaPage() {
  const navigate = useNavigate();
  const createKava = useCreateKava();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const slug = watch("slug", "");

  const onSubmit = (data: RegisterInput) => {
    createKava.mutate(data, {
      onSuccess: () => navigate("/superadmin/kavas", { replace: true }),
    });
  };

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Νέα κάβα</h1>
        <Link
          to="/superadmin/kavas"
          className="text-sm text-amber-600 hover:text-amber-700 font-medium"
        >
          ← Πίσω
        </Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <Input
          id="name"
          label="Όνομα κάβας"
          placeholder="Η Κάβα της Πελοποννήσου"
          error={errors.name?.message}
          {...register("name")}
        />

        <div>
          <Input
            id="slug"
            label="Slug"
            placeholder="i-kava-mou"
            error={errors.slug?.message}
            {...register("slug")}
          />
          {slug && <p className="mt-1 text-xs text-gray-500">{slug}.kavanow.gr</p>}
        </div>

        <Input
          id="email"
          type="email"
          label="Email ιδιοκτήτη"
          placeholder="owner@example.com"
          error={errors.email?.message}
          {...register("email")}
        />

        <Input
          id="password"
          type="password"
          label="Αρχικός κωδικός (προαιρετικό)"
          placeholder="Τουλάχιστον 8 χαρακτήρες"
          error={errors.password?.message}
          {...register("password")}
        />

        <Input
          id="confirmPassword"
          type="password"
          label="Επιβεβαίωση κωδικού"
          placeholder="Επαναλάβετε τον κωδικό"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        <p className="text-xs text-gray-400">
          Αν δεν ορίσετε κωδικό, ο ιδιοκτήτης θα λάβει σύνδεσμο σύνδεσης στο email του.
        </p>

        {createKava.error && (
          <p className="text-sm text-red-600">
            {createKava.error instanceof Error ? createKava.error.message : "Κάτι πήγε στραβά"}
          </p>
        )}

        <Button type="submit" loading={createKava.isPending}>
          Δημιουργία
        </Button>
      </form>
    </div>
  );
}
