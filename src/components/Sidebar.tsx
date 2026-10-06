import React from 'react';
import { Layers, Folder, Star, Film, Tv, Radio, Sparkles } from 'lucide-react';

interface SidebarProps {
  groups: { name: string; count: number }[];
  selectedGroup: string;
  onSelectGroup: (group: string) => void;
  totalChannelsCount: number;
  favoritesCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  groups,
  selectedGroup,
  onSelectGroup,
  totalChannelsCount,
  favoritesCount
}) => {
  const getGroupIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('fav') || lower.includes('thích')) return <Star className="w-3.5 h-3.5 text-amber-400" />;
    if (lower.includes('movie') || lower.includes('phim')) return <Film className="w-3.5 h-3.5 text-blue-400" />;
    if (lower.includes('news') || lower.includes('thời sự') || lower.includes('tin tức'))
      return <Tv className="w-3.5 h-3.5 text-red-400" />;
    if (lower.includes('radio') || lower.includes('music') || lower.includes('nhạc'))
      return <Radio className="w-3.5 h-3.5 text-purple-400" />;
    if (lower.includes('sport') || lower.includes('thể thao'))
      return <Sparkles className="w-3.5 h-3.5 text-emerald-400" />;
    return <Folder className="w-3.5 h-3.5 text-zinc-400" />;
  };

  return (
    <aside className="w-64 bg-zinc-900/90 border-r border-zinc-800 flex flex-col h-full overflow-hidden select-none">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Layers className="w-4 h-4 text-emerald-500" />
          <span>Nhóm kênh ({groups.length})</span>
        </div>
      </div>

      {/* Groups List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700">
        {/* All Channels Item */}
        <button
          onClick={() => onSelectGroup('All')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            selectedGroup === 'All'
              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950 font-semibold'
              : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2.5 truncate">
            <Layers className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">Tất cả kênh</span>
          </div>
          <span
            className={`text-[11px] px-1.5 py-0.5 rounded-full ${
              selectedGroup === 'All' ? 'bg-emerald-700 text-emerald-100' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {totalChannelsCount}
          </span>
        </button>

        {/* Dynamic Groups */}
        {groups.map(group => {
          const isSelected = selectedGroup === group.name;
          return (
            <button
              key={group.name}
              onClick={() => onSelectGroup(group.name)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950 font-semibold'
                  : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <span className="flex-shrink-0">{getGroupIcon(group.name)}</span>
                <span className="truncate">{group.name}</span>
              </div>
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  isSelected ? 'bg-emerald-700 text-emerald-100' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {group.count}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
