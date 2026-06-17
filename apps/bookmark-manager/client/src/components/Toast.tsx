import { useEffect } from 'react';

interface Props {
  message: string;
  onDone: () => void;
}

export default function Toast({ message, onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [message, onDone]);

  return (
    <div className="fixed left-0 right-0 bottom-6 flex justify-center pointer-events-none z-50 px-4">
      <div className="glass-pill rounded-full px-4 py-2 text-[13px] font-medium text-white pointer-events-auto">
        {message}
      </div>
    </div>
  );
}
