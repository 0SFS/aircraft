import { HelpTip, Resettable } from "foss-earth/shell";
import { createIssueReportView } from "@foss-earth/ui/diagnostics";
import { Plane } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  AIRCRAFT_FAMILIES,
  getAircraftDefinition,
  getAircraftFamilyForAircraft,
  normalizeAircraftSelection,
  type AircraftFamilyDefinition,
  type AircraftId,
  type AircraftLodId,
  type AircraftModelCredit,
  type AircraftSelection,
} from "./aircraftCatalog";
import type { AircraftModelStatus } from "./createAircraftModel";
import { resolveAssetUrl } from "./resolveAssetUrl";

/** The fields of the flight panel's snapshot that this panel reads. */
export interface AircraftSelectionPanelSnapshot {
  aircraftId: AircraftId;
  generationId?: string;
  lodId: AircraftLodId;
  modelStatus: AircraftModelStatus;
  /** Level actually in the scene; differs from lodId while "Auto" is selected. */
  modelActiveLodId: AircraftLodId | null;
  modelTriangles: number | null;
  modelError: string | null;
}

const MODEL_STATUS_LABEL: Record<AircraftModelStatus, string> = {
  placeholder: "Placeholder blocks",
  loading: "Loading mesh…",
  ready: "Mesh loaded",
  error: "Load failed",
};

const SKIP_CONFIRMATION_KEY = "0sfs.aircraft-switch.skip-confirmation";

interface AircraftSelectionPanelProps {
  snapshot: AircraftSelectionPanelSnapshot;
  selection: AircraftSelection;
  onSelectionChange(selection: AircraftSelection): void;
  onFamilyChange(familyId: string): void;
  /** Resolves when the complete aircraft is ready, or returns its error report. */
  onApply(selection: AircraftSelection): string | null | Promise<string | null>;
  switching?: boolean;
  onSwitchModeChange?(switchMode: boolean): void;
}

function ModelCredit({ credit, prefix = "" }: { credit: AircraftModelCredit; prefix?: string }) {
  return (
    <p className="flight-panel__hint">
      {prefix}<strong>{credit.artist}</strong>{` — ${credit.note}`}
      {credit.licence ? ` ${credit.licence}.` : null}
      {credit.sourceUrl ? <> <a href={credit.sourceUrl} target="_blank" rel="noreferrer noopener">Source</a></> : null}
    </p>
  );
}

function FamilyThumbnail({ family }: { family: AircraftFamilyDefinition }) {
  const [failed, setFailed] = useState(false);
  const path = family.thumbnail?.path;
  return (
    <span className="flight-panel__aircraft-image">
      {path && !failed ? (
        <img src={resolveAssetUrl(path)} alt="" width="640" height="400"
          decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span className="flight-panel__aircraft-image-fallback">
          <Plane size={30} aria-hidden="true" />
          <span>Image unavailable</span>
        </span>
      )}
    </span>
  );
}

/** Native modal dialogs keep keyboard focus in the warning, above the aircraft window. */
function AircraftDialog({ titleId, onDismiss, wide = false, children }: {
  titleId: string;
  onDismiss(): void;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (typeof dialog.close === "function" && dialog.open) dialog.close(); };
  }, []);
  return (
    <dialog className="flight-panel__aircraft-dialog" ref={ref} aria-labelledby={titleId}
      onKeyDown={event => event.stopPropagation()}
      onCancel={event => { event.preventDefault(); onDismiss(); }}>
      <div className={`flight-panel__aircraft-dialog-content${wide ? " is-wide" : ""}`}>{children}</div>
    </dialog>
  );
}

/** Editing the loaded aircraft and choosing its replacement are separate views. */
export function AircraftSelectionPanel({
  snapshot, onSelectionChange, onFamilyChange, onApply,
  switching = false, onSwitchModeChange,
}: AircraftSelectionPanelProps) {
  const id = useId();
  const [switchMode, setSwitchMode] = useState(false);
  const [confirmation, setConfirmation] = useState<AircraftSelection | null>(null);
  const [skipConfirmation, setSkipConfirmation] = useState(() => {
    try { return localStorage.getItem(SKIP_CONFIRMATION_KEY) === "true"; }
    catch { return false; }
  });
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const reportHost = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!applyError || !reportHost.current) return;
    const viewer = createIssueReportView(applyError, { document: reportHost.current.ownerDocument });
    reportHost.current.append(viewer.element);
    return () => viewer.destroy();
  }, [applyError]);
  const activeSelection = normalizeAircraftSelection(snapshot);
  const activeDefinition = getAircraftDefinition(snapshot.aircraftId);
  const family = getAircraftFamilyForAircraft(snapshot.aircraftId);
  // Every edit applies immediately; snapshots also reflect presets and generic settings.
  const editingSelection = activeSelection;
  const definition = activeDefinition;
  const activeVariant = family.variants.find(variant => variant.id === editingSelection.generationId)
    ?? family.variants.find(variant => variant.aircraftId === editingSelection.aircraftId)
    ?? family.variants[0];
  const offered = definition.lods;
  const activeLod = activeDefinition.lods.find(lod => lod.id === snapshot.modelActiveLodId);
  const credited = [...offered, ...(activeLod ? [activeLod] : [])].reduce<AircraftModelCredit[]>((keep, lod) => {
    if (!keep.some(credit => credit.artist === lod.credit.artist
      && credit.sourceUrl === lod.credit.sourceUrl && credit.licence === lod.credit.licence)) keep.push(lod.credit);
    return keep;
  }, []);
  const busy = switching || applying;

  const changeMode = (next: boolean) => {
    setSwitchMode(next);
    onSwitchModeChange?.(next);
  };
  const restoreActiveSelection = () => {
    onSelectionChange(activeSelection);
    onFamilyChange(family.id);
  };
  const apply = async (next: AircraftSelection) => {
    setConfirmation(null);
    setApplyError(null);
    setApplying(true);
    changeMode(false);
    onSelectionChange(next);
    try {
      const error = await onApply(next);
      if (error) {
        setApplyError(error);
        restoreActiveSelection();
      }
    } catch (error) {
      setApplyError(error instanceof Error ? (error.stack ?? error.message) : String(error));
      restoreActiveSelection();
    } finally {
      setApplying(false);
    }
  };
  const requestSwitch = (next: AircraftSelection) => {
    if (busy) return;
    const normalized = normalizeAircraftSelection(next);
    if (skipConfirmation) void apply(normalized);
    else {
      setDontShowAgain(false);
      setConfirmation(normalized);
    }
  };
  const cancelConfirmation = () => {
    setConfirmation(null);
    restoreActiveSelection();
  };
  const updateModel = (next: AircraftSelection) => {
    const normalized = normalizeAircraftSelection(next);
    if (normalized.aircraftId !== snapshot.aircraftId) requestSwitch(normalized);
    else void apply(normalized);
  };

  return (
    <div className="flight-panel__aircraft-picker" aria-busy={busy}>
      {!switchMode ? (
        <div className="flight-panel__aircraft-current">
          <FamilyThumbnail key={family.id} family={family} />
          <strong>{activeDefinition.label}</strong>
          <button className="flight-panel__command" type="button" disabled={busy}
            aria-label="Switch aircraft" aria-expanded={false} onClick={() => changeMode(true)}>
            Switch
          </button>
        </div>
      ) : null}

      {switchMode ? (
        <fieldset className="flight-panel__fieldset" disabled={busy}>
          <legend>Choose an aircraft</legend>
          <div className="flight-panel__aircraft-gallery">
            {AIRCRAFT_FAMILIES.map(entry => entry.id === family.id ? (
              <button key={entry.id} type="button" className="flight-panel__aircraft-card is-selected"
                aria-label={`Edit ${activeDefinition.label}`} aria-current="true"
                disabled={busy} onClick={() => changeMode(false)}>
                <FamilyThumbnail family={entry} />
                <span className="flight-panel__aircraft-card-caption">
                  <strong>{activeDefinition.label}</strong>
                  <span className="flight-panel__aircraft-card-footer">
                    <span>Currently loaded</span>
                    <span className="flight-panel__command">Edit</span>
                  </span>
                </span>
              </button>
            ) : (
              <button key={entry.id} type="button" className="flight-panel__aircraft-card"
                aria-label={`Switch to ${entry.label}`}
                disabled={busy}
                onClick={() => {
                  onFamilyChange(entry.id);
                  requestSwitch(normalizeAircraftSelection({
                    aircraftId: entry.defaultAircraftId,
                    lodId: activeSelection.lodId,
                  }));
                }}>
                <FamilyThumbnail family={entry} />
                <span className="flight-panel__aircraft-card-caption">
                  <strong>{entry.label}</strong>
                  <span aria-hidden="true">Switch</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <section className="flight-panel__aircraft-controls" aria-labelledby={`${id}-settings-name`}>
          <div className="flight-panel__section-heading">
            <strong id={`${id}-settings-name`}>Aircraft settings</strong>
            <HelpTip label="Show aircraft details">
              <div className="flight-panel__info-content">
                <p className="flight-panel__hint">{activeDefinition.summary}</p>
                {family.developmentNote ? <p className="flight-panel__hint">{family.developmentNote}</p> : null}
                <div className="flight-panel__model-status" role="status" aria-label={`Current model for ${activeDefinition.label}`}>
                  <div className="flight-panel__metrics">
                    <div className="flight-panel__metric">
                      <span>Current model</span><strong>{MODEL_STATUS_LABEL[snapshot.modelStatus]}</strong>
                    </div>
                    <div className="flight-panel__metric">
                      <span>Triangles</span><strong>{snapshot.modelTriangles?.toLocaleString() ?? "—"}</strong>
                    </div>
                  </div>
                  {snapshot.lodId === "auto" && activeLod ? <p className="flight-panel__hint">Auto selected {activeLod.label}.</p> : null}
                  {snapshot.modelError ? <p className="flight-panel__hint is-error">{snapshot.modelError}</p> : null}
                </div>
                {credited.map(credit => <ModelCredit key={`${credit.artist}-${credit.sourceUrl ?? ""}`} credit={credit} />)}
                {offered.length === 0 ? <p className="flight-panel__hint">No mesh exists for this airframe yet, so the block placeholder is drawn instead.</p> : null}
                {family.thumbnail ? <ModelCredit credit={family.thumbnail.credit} prefix="Gallery image: " /> : null}
              </div>
            </HelpTip>
          </div>
          {family.variantLabel && family.variants.length > 1 ? (
            <label className="flight-panel__field flight-panel__generation-field">
              <span>{family.variantLabel}</span>
              <select className="flight-panel__select" value={activeVariant.id} disabled={busy}
                onChange={event => {
                  const variant = family.variants.find(entry => entry.id === event.target.value);
                  if (variant) updateModel({ ...editingSelection, generationId: variant.id, aircraftId: variant.aircraftId });
                }}>
                {family.variants.map(variant => <option key={variant.id} value={variant.id}>{variant.label}</option>)}
              </select>
            </label>
          ) : null}
          <fieldset className="flight-panel__fieldset flight-panel__model-controls" disabled={busy}>
            <legend>Model detail</legend>
            <label className="flight-panel__field">
              <span>Level of detail</span>
              <Resettable changed={!busy && offered.length > 0 && editingSelection.lodId !== "auto"}
                label="Reset Level of detail to the default: Auto (by chase distance)"
                onReset={() => updateModel({ ...editingSelection, lodId: "auto" })}>
                <select className="flight-panel__select" value={editingSelection.lodId}
                  disabled={busy || offered.length === 0}
                  onChange={event => updateModel({ ...editingSelection, lodId: event.target.value as AircraftLodId })}>
                  <option value="auto">Auto (by chase distance)</option>
                  {offered.map(lod => <option key={lod.id} value={lod.id}>{`${lod.label} — ${lod.triangles.toLocaleString()} tris`}</option>)}
                </select>
              </Resettable>
            </label>
          </fieldset>
        </section>
      )}

      {confirmation ? (
        <AircraftDialog titleId={`${id}-confirm-title`} onDismiss={cancelConfirmation}>
          <div className="flight-panel__aircraft-dialog-image">
            <FamilyThumbnail family={getAircraftFamilyForAircraft(confirmation.aircraftId)} />
          </div>
          <h2 id={`${id}-confirm-title`}>Switch to {getAircraftDefinition(confirmation.aircraftId).label}?</h2>
          <p>The current aircraft will be replaced. Your flight will stay paused until the new aircraft is ready.</p>
          <label className="flight-panel__aircraft-confirm-preference">
            <input type="checkbox" checked={dontShowAgain} onChange={event => setDontShowAgain(event.target.checked)} />
            <span>Don’t show again</span>
          </label>
          <div className="flight-panel__aircraft-dialog-actions">
            <button className="flight-panel__command flight-panel__command--secondary" type="button" autoFocus onClick={cancelConfirmation}>Cancel</button>
            <button className="flight-panel__command" type="button" onClick={() => {
              if (dontShowAgain) {
                setSkipConfirmation(true);
                try { localStorage.setItem(SKIP_CONFIRMATION_KEY, "true"); } catch { /* Keep the choice for this session. */ }
              }
              void apply(confirmation);
            }}>Confirm</button>
          </div>
        </AircraftDialog>
      ) : null}

      {applyError ? (
        <AircraftDialog titleId={`${id}-error-title`} wide onDismiss={() => setApplyError(null)}>
          <h2 id={`${id}-error-title`}>Could not change aircraft</h2>
          <p>The aircraft was not changed. The report index names the failure and the line to read.</p>
          <div ref={reportHost} />
          <div className="flight-panel__aircraft-dialog-actions">
            <button className="flight-panel__command" type="button" onClick={() => setApplyError(null)}>Close</button>
          </div>
        </AircraftDialog>
      ) : null}
    </div>
  );
}
