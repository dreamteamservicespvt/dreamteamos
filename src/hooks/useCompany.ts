/**
 * The company as it should be printed, live.
 *
 * One subscription to `company_settings/main`, merged over the built-in defaults, so every
 * letterhead, ID card and payslip in the app shows the same address the moment somebody changes it
 * in Settings — without a deploy, and without each of them having to know where it came from.
 */
import { useEffect, useState } from "react";
import { watchCompanyAssets } from "@/services/companyAssets";
import {
  officerOf, resolveCompany,
  type CompanyAssets, type CompanyOfficer, type OfficerKey, type ResolvedCompany,
} from "@/utils/company";

export interface CompanyContext {
  /** Identity, defaults already applied — safe to print without null checks. */
  company: ResolvedCompany;
  /** The raw settings document, for the few callers that need to know what was actually stored. */
  assets: CompanyAssets;
  officer: (key: OfficerKey) => CompanyOfficer;
  /** True once the settings document has been read at least once. */
  loaded: boolean;
}

export function useCompany(): CompanyContext {
  const [assets, setAssets] = useState<CompanyAssets>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => watchCompanyAssets((a) => { setAssets(a); setLoaded(true); }), []);

  return {
    company: resolveCompany(assets),
    assets,
    officer: (key) => officerOf(assets, key),
    loaded,
  };
}
