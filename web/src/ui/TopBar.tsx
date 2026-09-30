interface Props {
  online: boolean;
  busy: boolean;
}

export function TopBar({ online, busy }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          ▲
        </span>
        <span className="brand-name">Boondock</span>
      </div>
      <div className="topbar-right">
        {busy && <span className="busy-dot" aria-label="Loading map data" />}
        <span className={`net-pill ${online ? "on" : "off"}`}>
          <span className="net-led" aria-hidden />
          {online ? "Online" : "Offline"}
        </span>
      </div>
    </header>
  );
}
