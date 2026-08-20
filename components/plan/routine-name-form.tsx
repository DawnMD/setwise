"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { dayName, routineName } from "@/db/validators";
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

/**
 * One text field in a drawer, used for naming a routine and naming a day.
 *
 * A drawer rather than an inline input because the OS keyboard covers the
 * bottom half of the screen, and a field that ends up underneath it is a field
 * nobody can see what they are typing into.
 */
type RoutineNameFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  saveLabel: string;
  kind?: "routine" | "day";
  pending?: boolean;
  onSave: (name: string) => unknown | Promise<unknown>;
};

type NameValues = { name: string };

export function RoutineNameForm({ open, onOpenChange, ...form }: RoutineNameFormProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {open ? <OpenRoutineNameForm {...form} /> : null}
    </Drawer>
  );
}

function OpenRoutineNameForm({
  title,
  description,
  label = "Name",
  placeholder,
  initialValue = "",
  saveLabel,
  kind = "routine",
  pending = false,
  onSave,
}: Omit<RoutineNameFormProps, "open" | "onOpenChange">) {
  const form = useForm<NameValues>({
    resolver: zodResolver(z.object({ name: kind === "day" ? dayName : routineName })),
    defaultValues: { name: initialValue },
    mode: "onTouched",
    reValidateMode: "onChange",
    criteriaMode: "all",
  });

  const submit = form.handleSubmit(async ({ name }) => {
    form.clearErrors("root");

    try {
      await onSave(name);
    } catch {
      form.setError("root.server", {
        type: "server",
        message: "Couldn't save that name. Check your connection and try again.",
      });
    }
  });

  const busy = pending || form.formState.isSubmitting;
  const serverError = form.formState.errors.root?.server?.message;

  return (
    <DrawerContent className="mx-auto max-w-[520px]">
      <DrawerHeader>
        <DrawerTitle>{title}</DrawerTitle>
        {description ? <DrawerDescription>{description}</DrawerDescription> : null}
      </DrawerHeader>

      <form className="p-4" onSubmit={submit} noValidate>
        <FieldGroup>
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="routine-name">{label}</FieldLabel>
                <Input
                  {...field}
                  id="routine-name"
                  placeholder={placeholder}
                  autoComplete="off"
                  autoFocus
                  maxLength={kind === "day" ? 60 : 80}
                  aria-invalid={fieldState.invalid}
                  className="h-11 text-base"
                />
                {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
              </Field>
            )}
          />

          {serverError ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t save</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" size="touch" className="w-full" disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {saveLabel}
          </Button>
        </FieldGroup>
      </form>
    </DrawerContent>
  );
}
