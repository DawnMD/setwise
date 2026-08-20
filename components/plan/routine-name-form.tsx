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
export function RoutineNameForm({
  open,
  onOpenChange,
  title,
  description,
  label = "Name",
  placeholder,
  initialValue = "",
  saveLabel,
  pending = false,
  onSave,
}: {
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
}) {
  const [value, setValue] = React.useState(initialValue);

  // Seeded per opening rather than per mount: this drawer is reused for every
  // rename on the screen, so it has to forget the last one.
  React.useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const trimmed = value.trim();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
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
    </Drawer>
  );
}
