import { NavLink } from "react-router-dom";

type NavItem = { to: string; label: string; ico: string };
type NavSection = { title: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    title: "Огляд",
    items: [
      { to: "/dashboard", label: "Дашборд", ico: "▦" },
      { to: "/runtime", label: "Runtime", ico: "◷" },
      { to: "/presence", label: "Хто на стрімі", ico: "◉" },
    ],
  },
  {
    title: "Економіка та ігри",
    items: [
      { to: "/economy", label: "Економіка", ico: "◈" },
      { to: "/buffs", label: "Бафи", ico: "✦" },
      { to: "/fun-meter", label: "Fun Meter", ico: "☺" },
      { to: "/guess", label: "Вгадай число", ico: "?" },
      { to: "/giveaway", label: "Розіграш", ico: "🎁" },
      { to: "/song-request", label: "Пісні", ico: "♪" },
      { to: "/supporter", label: "Перки", ico: "♛" },
    ],
  },
  {
    title: "Команди",
    items: [
      { to: "/commands", label: "Команди", ico: "⌘" },
      { to: "/guide", label: "Довідник (публічний)", ico: "📖" },
    ],
  },
  {
    title: "Система",
    items: [
      { to: "/auth", label: "Авторизація", ico: "⚿" },
      { to: "/channel-points", label: "Бали каналу", ico: "★" },
      { to: "/simulation", label: "Симуляція", ico: "▷" },
      { to: "/settings", label: "Налаштування", ico: "⚙" },
    ],
  },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark">⚡</span>
        <span>Twitch Admin</span>
      </div>

      <nav className="sidebar__nav">
        {navSections.map((section) => (
          <div className="sidebar__section" key={section.title}>
            <div className="sidebar__section-title">{section.title}</div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? "sidebar__link sidebar__link--active" : "sidebar__link"
                }
              >
                <span className="sidebar__link-ico" aria-hidden="true">
                  {item.ico}
                </span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
