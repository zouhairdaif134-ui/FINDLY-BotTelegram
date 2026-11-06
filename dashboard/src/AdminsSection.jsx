import { useEffect, useMemo, useState } from "react";
import "./admins-section.css";

export default function AdminsSection({ fetchApi, currentUserId }) {
  const [admins, setAdmins] = useState([]);
  const [roles, setRoles] = useState([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [adminData, roleData] = await Promise.all([
        fetchApi("/api/admins"),
        fetchApi("/api/admins/roles")
      ]);
      setAdmins(adminData || []);
      setRoles(roleData || []);
      setRoleId((current) => current || roleData?.[0]?.id || "");
    } catch (err) {
      setError(err.message || "Unable to load administrators");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filteredAdmins = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return admins;
    return admins.filter((admin) =>
      [admin.email, admin.display_name, ...(admin.roles || []).map((role) => role.name)]
        .filter(Boolean).some((value) => value.toLowerCase().includes(term))
    );
  }, [admins, search]);

  async function sendInvite(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchApi("/api/admins/invite", {
        method: "POST",
        body: JSON.stringify({ email, display_name: displayName, role_id: roleId })
      });
      setEmail("");
      setDisplayName("");
      setNotice(`Invitation sent to ${result.email}. They must accept the email invitation before signing in.`);
      await load();
    } catch (err) {
      setError(err.message || "Unable to send administrator invitation");
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(admin, nextRoleId) {
    if (!nextRoleId || admin.is_owner) return;
    setError("");
    setNotice("");
    try {
      await fetchApi(`/api/admins/${encodeURIComponent(admin.id)}`, {
        method: "PUT",
        body: JSON.stringify({ role_id: nextRoleId })
      });
      setNotice(`Role updated for ${admin.email || admin.display_name}.`);
      await load();
    } catch (err) {
      setError(err.message || "Unable to update administrator role");
    }
  }

  async function toggleActive(admin) {
    if (admin.is_owner) return;
    const nextActive = !admin.is_active;
    const message = nextActive
      ? `Reactivate access for ${admin.email}?`
      : `Deactivate access for ${admin.email}? They will no longer be able to use the FINDLY dashboard.`;
    if (!window.confirm(message)) return;
    setError("");
    setNotice("");
    try {
      await fetchApi(`/api/admins/${encodeURIComponent(admin.id)}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: nextActive })
      });
      setNotice(nextActive ? "Administrator reactivated." : "Administrator access deactivated.");
      await load();
    } catch (err) {
      setError(err.message || "Unable to update administrator status");
    }
  }

  return (
    <section className="admins-workspace">
      <div className="admins-summary">
        <div className="admins-stat"><span>Total administrators</span><strong>{admins.length}</strong></div>
        <div className="admins-stat"><span>Active</span><strong>{admins.filter((item) => item.is_active).length}</strong></div>
        <div className="admins-stat"><span>Pending invitations</span><strong>{admins.filter((item) => !item.last_sign_in_at).length}</strong></div>
      </div>

      <section className="panel admins-invite-panel">
        <div className="admins-panel-heading">
          <div><h2>Invite an administrator</h2><p>Send a secure email invitation. The invited person creates their own password.</p></div>
          <span className="admins-lock">Owner only</span>
        </div>
        <form className="admins-invite-form" onSubmit={sendInvite}>
          <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" required /></label>
          <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Administrator name" maxLength={100} /></label>
          <label>Role<select value={roleId} onChange={(event) => setRoleId(event.target.value)} required>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name === "manager" ? "Manager" : "Content Manager"} — {role.description || ""}</option>)}
          </select></label>
          <button className="primary-button" type="submit" disabled={saving || !roles.length}>{saving ? "Sending invitation…" : "Send invitation"}</button>
        </form>
      </section>

      {error && <div className="admins-alert error" role="alert">{error}</div>}
      {notice && <div className="admins-alert success" role="status">{notice}</div>}

      <section className="panel admins-list-panel">
        <div className="admins-list-heading">
          <div><h2>Administrator accounts</h2><p>Manage roles and access. The owner account is protected.</p></div>
          <div className="admins-list-actions">
            <input aria-label="Search administrators" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email or name…" />
            <button className="secondary-button" type="button" onClick={load}>Refresh</button>
          </div>
        </div>
        {loading ? <div className="empty">Loading administrators…</div> : (
          <div className="table-wrap">
            <table className="data-table admins-table">
              <thead><tr><th>Administrator</th><th>Role</th><th>Invitation</th><th>Access</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredAdmins.map((admin) => {
                  const currentRole = admin.roles?.[0];
                  return <tr key={admin.id}>
                    <td><div className="content-title"><strong>{admin.display_name || "Administrator"}</strong><small>{admin.email || "Email unavailable"}</small></div></td>
                    <td>{admin.is_owner ? <span className="admins-owner-role">Owner</span> : (
                      <select aria-label={`Role for ${admin.email}`} value={currentRole?.id || ""} onChange={(event) => changeRole(admin, event.target.value)}>
                        {roles.map((role) => <option key={role.id} value={role.id}>{role.name === "manager" ? "Manager" : "Content Manager"}</option>)}
                      </select>
                    )}</td>
                    <td><span className={admin.last_sign_in_at ? "admins-state complete" : "admins-state pending"}>{admin.last_sign_in_at ? "Accepted" : "Pending"}</span></td>
                    <td><span className={admin.is_active ? "admins-state complete" : "admins-state disabled"}>{admin.is_active ? "Active" : "Disabled"}</span></td>
                    <td>{admin.is_owner ? <span className="admins-protected">Protected account</span> : <button className="table-button" type="button" onClick={() => toggleActive(admin)}>{admin.is_active ? "Deactivate" : "Reactivate"}</button>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
            {!filteredAdmins.length && <div className="empty">No administrators found.</div>}
          </div>
        )}
      </section>
      <p className="admins-footnote">Deactivating an account blocks access to protected FINDLY APIs. It does not delete the Auth account or its history.</p>
    </section>
  );
}
