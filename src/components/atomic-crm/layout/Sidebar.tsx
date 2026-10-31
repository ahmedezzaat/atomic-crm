import {
  Building2,
  CheckSquare,
  ChevronDown,
  Handshake,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Phone,
  Radar,
  UserCheck,
  Users,
} from "lucide-react";
import { useTranslate } from "ra-core";
import { useState, type ComponentType } from "react";
import { Link, matchPath, useLocation } from "react-router";

import { useConfigurationContext } from "../root/ConfigurationContext";

type Icon = ComponentType<{ className?: string }>;

const isActive = (pathname: string, to: string) =>
  to === "/"
    ? pathname === "/"
    : !!matchPath(to, pathname) || !!matchPath(`${to}/*`, pathname);

const itemClass = (active: boolean) =>
  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? "bg-primary text-primary-foreground"
      : "text-secondary-foreground/80 hover:bg-accent hover:text-accent-foreground"
  }`;

const NavItem = ({
  to,
  label,
  icon: Icon,
  nested = false,
}: {
  to: string;
  label: string;
  icon?: Icon;
  nested?: boolean;
}) => {
  const { pathname } = useLocation();
  return (
    <Link
      to={to}
      className={`${itemClass(isActive(pathname, to))} ${nested ? "pl-10" : ""}`}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      {label}
    </Link>
  );
};

// WhatsApp and SMS campaigns share one expandable "Campaigns" entry
const CampaignsGroup = () => {
  const { pathname } = useLocation();
  const inside =
    isActive(pathname, "/wa-campaigns") || isActive(pathname, "/sms");
  const [open, setOpen] = useState(inside);
  const expanded = open || inside;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(!expanded)}
        className={`${itemClass(false)} w-full ${inside ? "text-secondary-foreground" : ""}`}
        aria-expanded={expanded}
      >
        <Megaphone className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Campaigns</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <>
          <NavItem
            to="/wa-campaigns"
            label="WhatsApp"
            icon={MessageCircle}
            nested
          />
          <NavItem to="/sms" label="SMS" icon={MessageSquareText} nested />
        </>
      )}
    </div>
  );
};

export const Sidebar = () => {
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();
  const translate = useTranslate();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-secondary p-3 md:flex">
      <Link
        to="/"
        className="mb-3 flex items-center gap-2 px-2 py-2 text-secondary-foreground no-underline"
      >
        <img className="[.light_&]:hidden h-6" src={darkModeLogo} alt={title} />
        <img className="[.dark_&]:hidden h-6" src={lightModeLogo} alt={title} />
        <span className="text-xl font-semibold">{title}</span>
      </Link>
      <nav className="flex flex-col gap-1">
        <NavItem
          to="/"
          label={translate("ra.page.dashboard")}
          icon={LayoutDashboard}
        />
        <NavItem
          to="/contacts"
          label={translate("resources.contacts.name", { smart_count: 2 })}
          icon={Users}
        />
        <NavItem
          to="/companies"
          label={translate("resources.companies.name", { smart_count: 2 })}
          icon={Building2}
        />
        <NavItem
          to="/deals"
          label={translate("resources.deals.name", { smart_count: 2 })}
          icon={Handshake}
        />
        <NavItem
          to="/customers"
          label={translate("resources.customers.name", {
            smart_count: 2,
            _: "Customers",
          })}
          icon={UserCheck}
        />
        <NavItem
          to="/tasks"
          label={translate("resources.tasks.name", { smart_count: 2 })}
          icon={CheckSquare}
        />
        <NavItem to="/inbox" label="Inbox" icon={Inbox} />
        <NavItem to="/find-leads" label="Find leads" icon={Radar} />
        <NavItem to="/calls" label="Calls" icon={Phone} />
        <CampaignsGroup />
      </nav>
    </aside>
  );
};

export default Sidebar;
