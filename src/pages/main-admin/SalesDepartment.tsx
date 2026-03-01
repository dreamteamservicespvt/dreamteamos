import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { getRoleColor, getRoleLabel } from "@/utils/roleHelpers";
import { formatCurrency } from "@/utils/formatters";
import type { AppUser } from "@/types";
import { Phone, Users, TrendingUp, Target, ShoppingBag } from "lucide-react";

export default function SalesDepartment() {
  const [salesAdmins, setSalesAdmins] = useState<AppUser[]>([]);
  const [salesMembers, setSalesMembers] = useState<AppUser[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 2) setLoading(false); };
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
      const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      setSalesAdmins(allUsers.filter((u) => u.role === "sales_admin"));
      setSalesMembers(allUsers.filter((u) => u.role === "sales_member"));
      checkDone();
    }));
    unsubs.push(onSnapshot(collection(db, "leads"), (snap) => { setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); checkDone(); }));
    return () => unsubs.forEach((u) => u());
  }, []);

  const salesDone = leads.filter((l: any) => l.saleDone && l.saleDetails);
  const totalSalesRevenue = salesDone.reduce((s, l: any) => s + (l.saleDetails?.amount || 0), 0);
  const totalLeads = leads.length;

  const memberData = salesMembers.map((m) => {
    const memberLeads = leads.filter((l: any) => l.assignedTo === m.uid);
    const memberSales = memberLeads.filter((l: any) => l.saleDone && l.saleDetails);
    const revenue = memberSales.reduce((s, l: any) => s + (l.saleDetails?.amount || 0), 0);
    const called = memberLeads.filter((l: any) => l.status !== "not_called").length;
    return {
      ...m,
      totalLeads: memberLeads.length,
      salesCount: memberSales.length,
      revenue,
      called,
      target: m.dailyTarget || m.target || 10000,
    };
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 md:h-24 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Sales Department</h1>
        <p className="text-muted-foreground text-sm mt-1">Monitor sales team performance and leads</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatBox icon={Users} label="Sales Members" value={salesMembers.length} color="text-role-sales-member" />
        <StatBox icon={Phone} label="Total Leads" value={totalLeads} color="text-info" />
        <StatBox icon={ShoppingBag} label="Sales Closed" value={salesDone.length} color="text-success" />
        <StatBox icon={TrendingUp} label="Total Revenue" value={formatCurrency(totalSalesRevenue)} color="text-primary" />
      </div>

      {/* Sales Admins */}
      {salesAdmins.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 md:p-5">
          <h3 className="font-display font-semibold text-foreground mb-3">Sales Admins</h3>
          <div className="flex flex-wrap gap-3">
            {salesAdmins.map((a) => (
              <div key={a.uid} className="flex items-center gap-3 bg-background border border-border rounded-lg px-3 md:px-4 py-2 md:py-3">
                <div className="w-8 h-8 rounded-lg bg-role-sales-admin/15 flex items-center justify-center font-display font-bold text-role-sales-admin text-xs">
                  {a.name?.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${a.isActive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                  {a.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sales Members */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-border">
          <h3 className="font-display font-semibold text-foreground">Sales Members</h3>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Leads</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Called</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Sales</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue</th>
                <th className="text-left px-4 py-3 pl-4 font-medium text-muted-foreground">vs Target</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {memberData.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">No sales members yet</td></tr>
              ) : (
                memberData.map((m, i) => {
                  const pct = Math.min((m.revenue / m.target) * 100, 100);
                  return (
                    <tr key={m.uid} className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${i % 2 === 1 ? "bg-elevated/20" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-role-sales-member/15 flex items-center justify-center font-display font-bold text-role-sales-member text-xs">
                            {m.name?.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{m.name}</p>
                            <p className="text-xs text-muted-foreground">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{m.totalLeads}</td>
                      <td className="px-4 py-3 text-right font-mono">{m.called}</td>
                      <td className="px-4 py-3 text-right font-mono text-success">{m.salesCount}</td>
                      <td className="px-4 py-3 text-right font-mono text-primary">{formatCurrency(m.revenue)}</td>
                      <td className="px-4 py-3 pl-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground w-10 text-right">{Math.round(pct)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`w-2 h-2 rounded-full inline-block ${m.isActive ? "bg-success" : "bg-destructive"}`} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-border/50">
          {memberData.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted-foreground text-sm">No sales members yet</p>
          ) : (
            memberData.map((m) => {
              const pct = Math.min((m.revenue / m.target) * 100, 100);
              return (
                <div key={m.uid} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-role-sales-member/15 flex items-center justify-center font-display font-bold text-role-sales-member text-[10px]">
                        {m.name?.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{m.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{m.email}</p>
                      </div>
                    </div>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${m.isActive ? "bg-success" : "bg-destructive"}`} />
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div><p className="text-muted-foreground text-[10px]">Leads</p><p className="font-mono">{m.totalLeads}</p></div>
                    <div><p className="text-muted-foreground text-[10px]">Called</p><p className="font-mono">{m.called}</p></div>
                    <div><p className="text-muted-foreground text-[10px]">Sales</p><p className="font-mono text-success">{m.salesCount}</p></div>
                    <div className="text-right"><p className="text-muted-foreground text-[10px]">Revenue</p><p className="font-mono text-primary">{formatCurrency(m.revenue)}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">{Math.round(pct)}%</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 md:p-4">
      <div className="flex items-center gap-2 mb-1 md:mb-2">
        <Icon size={14} className={`md:w-4 md:h-4 ${color}`} />
        <span className="text-[10px] md:text-xs text-muted-foreground font-medium truncate">{label}</span>
      </div>
      <p className="font-display text-lg md:text-xl font-bold text-foreground truncate">{value}</p>
    </div>
  );
}