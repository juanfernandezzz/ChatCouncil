import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { createId, db, type PromptTemplate } from "@/lib/db";
import { deleteTemplateWithTombstone, extractTemplateVariables, interpolateTemplate } from "@/lib/prompt-templates";
import { useCouncilStore } from "@/store/useCouncilStore";
import { Button, Section, TextArea, TextInput } from "@chatcouncil/ui";

/**
 * Librería de prompts (Q29) — Fase 5. El esquema PromptTemplate existe
 * desde Fase 0 (con *tags indexados); acá va SOLO la UI de gestión y
 * el flujo Usar → interpolar {{variables}} → inyectar al ComposeBar.
 * Si el input ya tiene texto, se pide confirmación inline (pisar en
 * silencio pierde trabajo manual; anexar produce prompts Frankenstein
 * — decisión E5).
 */

interface EditorState {
  id: string | null; // null = plantilla nueva
  title: string;
  body: string;
  tagsRaw: string;
}

export function PromptTemplatesSection() {
  const templates = useLiveQuery(() => db.promptTemplates.orderBy("updatedAt").reverse().toArray(), [], []);
  const composePrompt = useCouncilStore((s) => s.composePrompt);
  const setComposePrompt = useCouncilStore((s) => s.setComposePrompt);

  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [usingId, setUsingId] = useState<string | null>(null);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [pendingInsert, setPendingInsert] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) => t.title.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [templates, search]);

  const saveEditor = async () => {
    if (!editor || !editor.title.trim() || !editor.body.trim()) return;
    const now = Date.now();
    const tags = editor.tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (editor.id) {
      await db.promptTemplates.update(editor.id, { title: editor.title.trim(), body: editor.body, tags, updatedAt: now });
    } else {
      const tpl: PromptTemplate = {
        id: createId("tpl"),
        title: editor.title.trim(),
        body: editor.body,
        tags,
        createdAt: now,
        updatedAt: now,
      };
      await db.promptTemplates.add(tpl);
    }
    setEditor(null);
  };

  const removeTemplate = async (tpl: PromptTemplate) => {
    // destructivo y poco frecuente: confirm nativo alcanza en v1 (E5)
    if (window.confirm(`¿Borrar la plantilla "${tpl.title}"?`)) {
      // Fase 6 (E2): tombstone incluido — sin él, el sync la resucitaría.
      await deleteTemplateWithTombstone(tpl.id);
    }
  };

  const insertText = (text: string) => {
    if (composePrompt.trim() && composePrompt !== text) {
      setPendingInsert(text);
      return;
    }
    setComposePrompt(text);
    setUsingId(null);
    setVarValues({});
  };

  const startUse = (tpl: PromptTemplate) => {
    const vars = extractTemplateVariables(tpl.body);
    if (vars.length === 0) {
      insertText(tpl.body);
      return;
    }
    setUsingId(tpl.id);
    setVarValues(Object.fromEntries(vars.map((v) => [v, ""])));
  };

  return (
    <Section
      title="Plantillas"
      action={
        <Button
          variant="accent"
          onClick={() => setEditor({ id: null, title: "", body: "", tagsRaw: "" })}
          className="flex items-center gap-1 py-0.5 text-[11px]"
        >
          <Plus size={12} aria-hidden />
          nueva
        </Button>
      }
    >

      <TextInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="buscar por título o tag…"
      />

      {pendingInsert !== null && (
        <div className="flex flex-col gap-1 rounded border border-accent-secondary p-2">
          <p className="text-[11px] text-text-primary">El input ya tiene texto. ¿Reemplazarlo con la plantilla?</p>
          <div className="flex gap-2">
            <Button
              variant="success"
              onClick={() => {
                setComposePrompt(pendingInsert);
                setPendingInsert(null);
                setUsingId(null);
                setVarValues({});
              }}
              className="py-0.5 text-[11px]"
            >
              Sí, reemplazar
            </Button>
            <Button onClick={() => setPendingInsert(null)} className="py-0.5 text-[11px]">
              No
            </Button>
          </div>
        </div>
      )}

      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {filtered.length === 0 && (
          <li className="text-[11px] text-text-secondary">
            {templates.length === 0 ? "Sin plantillas todavía — crea la primera." : "Nada matchea la búsqueda."}
          </li>
        )}
        {filtered.map((tpl) => {
          const vars = extractTemplateVariables(tpl.body);
          const isUsing = usingId === tpl.id;
          return (
            <li key={tpl.id} className="rounded border border-border p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-text-primary" title={tpl.body}>
                  {tpl.title}
                </span>
                <div className="flex shrink-0 gap-1">
                  <Button variant="accent" size="xs" onClick={() => startUse(tpl)}>
                    usar
                  </Button>
                  <Button
                    size="xs"
                    onClick={() =>
                      setEditor({ id: tpl.id, title: tpl.title, body: tpl.body, tagsRaw: tpl.tags.join(", ") })
                    }
                  >
                    editar
                  </Button>
                  <Button size="xs" onClick={() => void removeTemplate(tpl)}>
                    borrar
                  </Button>
                </div>
              </div>
              {tpl.tags.length > 0 && (
                <p className="mt-1 text-[10px] text-text-secondary">{tpl.tags.map((t) => `#${t}`).join(" ")}</p>
              )}
              {isUsing && vars.length > 0 && (
                <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                  {vars.map((v) => (
                    <label key={v} className="flex items-center gap-2 text-[11px] text-text-secondary">
                      <span className="w-24 truncate font-mono" title={v}>
                        {v}
                      </span>
                      <TextInput
                        fieldSize="xs"
                        value={varValues[v] ?? ""}
                        onChange={(e) => setVarValues((prev) => ({ ...prev, [v]: e.target.value }))}
                        className="flex-1"
                      />
                    </label>
                  ))}
                  {Object.values(varValues).some((v) => !v.trim()) && (
                    <p className="text-[10px] text-warning">Hay variables vacías — se insertan en blanco (no bloquea).</p>
                  )}
                  <Button variant="accent" onClick={() => insertText(interpolateTemplate(tpl.body, varValues))} className="self-start py-0.5 text-[11px]">
                    Insertar en el input
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {editor && (
        <div className="flex flex-col gap-1 rounded border border-accent-primary p-2">
          <TextInput
            value={editor.title}
            onChange={(e) => setEditor({ ...editor, title: e.target.value })}
            placeholder="título"
          />
          <TextArea
            value={editor.body}
            onChange={(e) => setEditor({ ...editor, body: e.target.value })}
            placeholder={"cuerpo — usa {{variable}} para pedir valores al usar"}
            rows={5}
            className="px-2 py-1 font-mono text-[11px]"
          />
          <TextInput
            value={editor.tagsRaw}
            onChange={(e) => setEditor({ ...editor, tagsRaw: e.target.value })}
            placeholder="tags separados por coma"
          />
          <div className="flex gap-2">
            <Button variant="accent" disabled={!editor.title.trim() || !editor.body.trim()} onClick={() => void saveEditor()} className="py-0.5 text-[11px]">
              Guardar
            </Button>
            <Button onClick={() => setEditor(null)} className="py-0.5 text-[11px]">
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}
