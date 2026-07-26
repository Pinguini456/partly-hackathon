export function WorkflowSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
    return (
        <div className="mb-10 flex items-center gap-4">
            <Step number="1" text="Upload" active={current === 1} />

            <div className="h-px flex-1 bg-slate-200" />

            <Step number="2" text="Analyse" active={current === 2} />

            <div className="h-px flex-1 bg-slate-200" />

            <Step number="3" text="Review" active={current === 3} />

            <div className="h-px flex-1 bg-slate-200" />

            <Step number="4" text="Repair Order" active={current === 4} />
        </div>
    );
}

function Step({
                  number,
                  text,
                  active,
              }: {
    number: string;
    text: string;
    active?: boolean;
}) {
    return (
        <div className="flex items-center gap-2">
            <div
                className={`
        flex
        h-8
        w-8
        items-center
        justify-center
        rounded-full
        text-sm
        font-medium

        ${
                    active
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-200 text-slate-700"
                }
        `}
            >
                {number}
            </div>

            <span className="text-sm text-slate-700">{text}</span>
        </div>
    );
}
