"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { projects } from "@/lib/data";
import { fmtUsd } from "@/lib/format";
import { COMPARE_PRESETS, availablePresets } from "@/lib/presets";
import { isLive } from "@/lib/coverage";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AddProjectPopover({ exclude, onAdd, disabled }: { exclude: string[]; onAdd: (id: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const candidates = projects.filter((p) => !exclude.includes(p.id)).sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || a.name.localeCompare(b.name));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={disabled} title={disabled ? "Compare holds up to 4 projects" : undefined}>
          <Plus className="size-3.5" /> Add project
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search projects" className="text-sm" />
          <CommandList className="max-h-64">
            <CommandEmpty>No project found.</CommandEmpty>
            <CommandGroup>
              {candidates.slice(0, 400).map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.sector}`}
                  onSelect={() => {
                    onAdd(p.id);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="ml-auto truncate pl-2 text-ink-300">{p.sector}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function PeerSuggestions({ peers, onAdd }: { peers: Project[]; onAdd: (id: string) => void }) {
  if (!peers.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-300">
      <span>Compare with</span>
      {peers.map((p) => (
        <Button key={p.id} variant="outline" size="xs" onClick={() => onAdd(p.id)}>
          {p.name}
          {p.tvl !== null && <span className="text-ink-300">{fmtUsd(p.tvl)}</span>}
        </Button>
      ))}
    </div>
  );
}

/** Preset buttons, resolved by name against the dataset; presets with fewer than two matches are hidden. */
export function PresetButtons({ onApply, className }: { onApply: (ids: string[]) => void; className?: string }) {
  const presets = availablePresets();
  if (!presets.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="type-label mr-1 text-ink-300">Presets</span>
      {presets.map((p) => (
        <Button key={p.name} variant="outline" size="xs" onClick={() => onApply(p.ids)} title={COMPARE_PRESETS.find((x) => x.name === p.name)?.projects.join(", ")}>
          {p.name}
        </Button>
      ))}
    </div>
  );
}
