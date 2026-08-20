"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
  pending?: boolean;
  onSave: (name: string) => void;
};

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
  pending = false,
  onSave,
}: Omit<RoutineNameFormProps, "open" | "onOpenChange">) {
  const [value, setValue] = React.useState(initialValue);

  const trimmed = value.trim();

  return (
    <DrawerContent className="mx-auto max-w-[520px]">
      <DrawerHeader>
        <DrawerTitle>{title}</DrawerTitle>
        {description ? <DrawerDescription>{description}</DrawerDescription> : null}
      </DrawerHeader>

      <form
        className="p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed.length > 0 && !pending) onSave(trimmed);
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="routine-name">{label}</FieldLabel>
            <Input
              id="routine-name"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              autoComplete="off"
              autoFocus
              className="h-11 text-base"
            />
          </Field>

          <Button
            type="submit"
            size="touch"
            className="w-full"
            disabled={trimmed.length === 0 || pending}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {saveLabel}
          </Button>
        </FieldGroup>
      </form>
    </DrawerContent>
  );
}
