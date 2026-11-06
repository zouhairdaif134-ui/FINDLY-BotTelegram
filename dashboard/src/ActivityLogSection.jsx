import { useEffect, useMemo, useState } from "react";
import "./activity-log-section.css";

const LIMIT = 50;
const SECRET_KEY = /(password|token|secret|api[_-]?key|authorization|credential|private[_-]?key|service[_-]?role)/i;

function safeJson(value) {
  if (Array.isArray(value)) return value.map(safeJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_KEY.test(key))
      .map(([key, item]) => [key, safeJson(item)])
  );
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function labelAction(action) {
  return String(action || "unknown").replaceAll(".", " · ").replaceAll("_", " ");
}

export default function ActivityLogSection({ fetchApi }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [result, setResult] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(nextOffset = offset) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(nextOffset) });
      if (actorId) params.set("actor_id", actorId);
      if (action.trim()) params.set("action", action.trim());
      if (entityType) params.set("entity_type", entityType);
      if (result) params.set("result", result);
      if (from) params.set("from", new Date(from + "T00:00:00").toISOString());
      if (to) params.set("to", new Date(to + "T23:59:59.999").toISOString());
      const response = await fetchApi("/api/activity?" + params.toString());
      setItems(response?.items || []);
      setTotal(Number(response?.total || 0));
      setOffset(nextOffset);
      setSelected(null);
    } catch (err) {
      setItems([]);
      setTotal(0);
      const message = err?.message || "Unable to load activity history";
      setError(message.includes("403") ? "ما عندكش الصلاحية لعرض سجل العمليات." : message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(0); }, [actorId, action, entityType, result, from, to]);

  const actors = useMemo(() => {
    const map = new Map();
    for (const item of items) if (item.actor_id) map.set(item.actor_id, item.actor_name || "Administrator");
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.actor_name, item.action, item.entity_type, item.entity_id, item.result]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(term))
    );
  }, [items, search]);

  function clearFilters() {
    setActorId("");
    setAction("");
    setEntityType("");
    setResult("");
    setFrom("");
    setTo("");
    setSearch("");
    setOffset(0);
  }

  return (
    <section className="activity-workspace">
      <div className="activity-summary">
        <div className="activity-stat"><span>Total matching records</span><strong>{total.toLocaleString()}</strong></div>
        <div className="activity-stat"><span>Current page</span><strong>{items.length}</strong></div>
        <div className="activity-stat"><span>Audit mode</span><strong>Append-only</strong></div>
      </div>

      <section className="panel activity-filter-panel">
        <div className="activity-heading">
          <div><h2>Administrative activity</h2><p>Verified actions performed in the FINDLY control center.</p></div>
          <button type="button" className="secondary-button" onClick={() => load(offset)} disabled={loading}>Refresh</button>
        </div>
        <div className="activity-filters">
          <label>Actor
            <select value={actorId} onChange={(event) => setActorId(event.target.value)}>
              <option value="">All actors</option>
              {actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
            </select>
          </label>
          <label>Action
            <input value={action} onChange={(event) => setAction(event.target.value)} placeholder="e.g. movie.publish" />
          </label>
          <label>Entity
            <select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
              <option value="">All entities</option>
              {["movie","bot","category","content","telegram_user","setting","admin"].map((value) => <option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}
            </select>
          </label>
          <label>Result
            <select value={result} onChange={(event) => setResult(event.target.value)}>
              <option value="">All results</option><option value="success">Success</option><option value="failure">Failure</option>
            </select>
          </label>
          <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <label className="activity-search">Search current page<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Actor, action, ID…" /></label>
          <button type="button" className="table-button" onClick={clearFilters}>Clear filters</button>
        </div>
      </section>

      {error && <div className="activity-alert" role="alert">{error}</div>}

      <section className="panel activity-table-panel">
        {loading ? <div className="empty">Loading activity history…</div> : (
          <>
            <div className="activity-table-wrap">
              <table className="data-table">
                <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Result</th><th></th></tr></thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.created_at)}</td>
                      <td>{item.actor_name || "Administrator"}</td>
                      <td><code>{labelAction(item.action)}</code></td>
                      <td><span>{item.entity_type}</span><small className="activity-id">{item.entity_id || "—"}</small></td>
                      <td><span className={"activity-result " + (item.result === "success" ? "is-success" : "is-failure")}>{item.result}</span></td>
                      <td><button type="button" className="table-button" onClick={() => setSelected(item)}>Details</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filteredItems.length && <div className="empty">{items.length ? "No records match the current page search." : "No activity records found."}</div>}
            <div className="activity-pagination">
              <span>Showing {total ? offset + 1 : 0}–{Math.min(offset + items.length, total)} of {total}</span>
              <div>
                <button type="button" className="secondary-button" disabled={loading || offset === 0} onClick={() => load(Math.max(0, offset - LIMIT))}>Previous</button>
                <button type="button" className="secondary-button" disabled={loading || offset + items.length >= total} onClick={() => load(offset + LIMIT)}>Next</button>
              </div>
            </div>
          </>
        )}
      </section>

      {selected && (
        <section className="panel activity-detail-panel">
          <div className="activity-heading">
            <div><h2>Activity details</h2><p>{labelAction(selected.action)} · {formatDate(selected.created_at)}</p></div>
            <button type="button" className="secondary-button" onClick={() => setSelected(null)}>Close</button>
          </div>
          <dl className="activity-detail-grid">
            <div><dt>Actor</dt><dd>{selected.actor_name} <small>{selected.actor_id}</small></dd></div>
            <div><dt>Entity</dt><dd>{selected.entity_type} <small>{selected.entity_id || "—"}</small></dd></div>
            <div><dt>Result</dt><dd>{selected.result}</dd></div>
            <div><dt>Record ID</dt><dd>{selected.id}</dd></div>
          </dl>
          <div className="activity-json-grid">
            <div><h3>Details</h3><pre>{JSON.stringify(safeJson(selected.details || {}), null, 2)}</pre></div>
            <div><h3>Before</h3><pre>{JSON.stringify(safeJson(selected.old_values), null, 2)}</pre></div>
            <div><h3>After</h3><pre>{JSON.stringify(safeJson(selected.new_values), null, 2)}</pre></div>
          </div>
        </section>
      )}
    </section>
  );
}
