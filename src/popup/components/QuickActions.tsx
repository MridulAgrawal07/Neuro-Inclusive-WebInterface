/**
 * QuickActions — renders the "Reset page" button at the bottom of the popup.
 *
 * Clicking reset removes all active transformations, persists the cleared
 * toggle state, and sends a RESET_PAGE message to the active tab.
 */

/** Props accepted by the QuickActions component. */
interface Props {
  /** Callback invoked when the user clicks "Reset page". */
  onReset: () => void;
}

export function QuickActions({ onReset }: Props) {
  return (
    <button
      onClick={onReset}
      className="w-full py-3 rounded-2xl text-[13px] font-semibold active:scale-[0.99] shadow-sm transition-all duration-200"
      style={{ backgroundColor: '#2A2A3E', border: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8' }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#32324A'; (e.currentTarget as HTMLButtonElement).style.color = '#CBD5E1'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#2A2A3E'; (e.currentTarget as HTMLButtonElement).style.color = '#94A3B8'; }}
    >
      Reset page
    </button>
  );
}
