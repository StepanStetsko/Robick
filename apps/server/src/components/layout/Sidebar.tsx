import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/dashboard", label: "Дашборд" },
  { to: "/runtime", label: "Runtime" },
  { to: "/auth", label: "Авторизація" },
  { to: "/commands", label: "Команди" },
  { to: "/channel-points", label: "Бали каналу" },
  { to: "/settings", label: "Налаштування" },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">Twitch Admin</div>

      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isActive ? "sidebar__link sidebar__link--active" : "sidebar__link"
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
