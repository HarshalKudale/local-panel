import React from "react";
import iconUrl from "@/icon.png";
import { strings } from "@/lib/strings";
import { SectionLabel, SectionCard } from "@/components/ui";
import { Star, Heart } from "@/lib/icons";

export default function AboutSection() {
  return (
    <section>
      <SectionLabel>{strings.settings.sectionAbout}</SectionLabel>

      <SectionCard>
        <div className="px-5 py-4 border-b border-border flex items-center gap-4">
          <img src={iconUrl} className="w-10 h-10 rounded-lg flex-shrink-0" alt={strings.titleBar.appName} />
          <div>
            <div className="text-sm font-semibold text-foreground">{strings.titleBar.appName}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{strings.settings.appDesc}</div>
          </div>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3 text-xs text-muted-foreground">
          <AboutRow label={strings.settings.version}>
            <span className="text-foreground font-mono">{__APP_VERSION__}</span>
          </AboutRow>
          <AboutRow label={strings.settings.author}>
            <span className="text-foreground">{strings.settings.authorName}</span>
          </AboutRow>
          <AboutRow label={strings.settings.github}>
            <a
              href={strings.settings.githubUrl}
              onClick={(e) => {
                e.preventDefault();
                window.api.openExternal(strings.settings.githubUrl);
              }}
              className="text-signal hover:underline font-mono cursor-pointer"
            >
              {strings.settings.githubDisplay}
            </a>
          </AboutRow>
          <AboutRow label={strings.settings.license}>
            <span className="text-foreground">{strings.settings.licenseName}</span>
          </AboutRow>
        </div>
        <div className="px-5 py-4 border-t border-border flex flex-wrap gap-3">
          <button
            onClick={() => window.api.openExternal("https://github.com/HarshalKudale/local-panel")}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-2 border border-border text-xs font-medium text-foreground hover:border-signal/50 hover:text-signal transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 .2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.49c-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 8 .2z" />
            </svg>
            <Star size={14} /> {strings.settings.starOnGitHub}
          </button>
          <button
            onClick={() =>
              window.api.openExternal("https://github.com/HarshalKudale/local-panel/blob/main/SUPPORT.md")
            }
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-2 border border-border text-xs font-medium text-foreground hover:border-signal/50 hover:text-signal transition-colors cursor-pointer"
          >
            <Heart size={14} /> {strings.settings.supportProject}
          </button>
        </div>
      </SectionCard>
    </section>
  );
}

function AboutRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-foreground font-medium w-16 flex-shrink-0">{label}</span>
      {children}
    </div>
  );
}
