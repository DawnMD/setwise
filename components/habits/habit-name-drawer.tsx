import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { habitName } from "@/db/validators";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type Values = { name: string };

export default function HabitNameDrawer({
  open,
  onOpenChange,
  initialValue = "",
  title,
  description,
  saveLabel,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue?: string;
  title: string;
  description: string;
  saveLabel: string;
  onSave: (name: string) => Promise<unknown>;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {open ? (
        <OpenForm
          initialValue={initialValue}
          title={title}
          description={description}
          saveLabel={saveLabel}
          onSave={onSave}
        />
      ) : null}
    </Drawer>
  );
}

function OpenForm({
  initialValue,
  title,
  description,
  saveLabel,
  onSave,
}: {
  initialValue: string;
  title: string;
  description: string;
  saveLabel: string;
  onSave: (name: string) => Promise<unknown>;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(z.object({ name: habitName })),
    defaultValues: { name: initialValue },
    mode: "onTouched",
    reValidateMode: "onChange",
  });
  const submit = form.handleSubmit(async ({ name }) => {
    form.clearErrors("root");
    try {
      await onSave(name);
    } catch (error) {
      form.setError("root.server", {
        type: "server",
        message: error instanceof Error ? error.message : "Couldn't save this habit. Try again.",
      });
    }
  });
  const error = form.formState.errors.root?.server?.message;

  return (
    <DrawerContent className="mx-auto max-w-[520px]">
      <DrawerHeader>
        <DrawerTitle>{title}</DrawerTitle>
        <DrawerDescription>{description}</DrawerDescription>
      </DrawerHeader>
      <form className="p-4" onSubmit={submit} noValidate>
        <FieldGroup>
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="habit-name">Name</FieldLabel>
                <Input
                  {...field}
                  id="habit-name"
                  autoComplete="off"
                  maxLength={80}
                  aria-invalid={fieldState.invalid}
                  className="h-11 text-base"
                />
                {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
              </Field>
            )}
          />
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t save</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            type="submit"
            size="touch"
            className="w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? <Spinner data-icon="inline-start" /> : null}
            {saveLabel}
          </Button>
        </FieldGroup>
      </form>
    </DrawerContent>
  );
}
