import RealtimeStage from '@/components/realtime-stage';
import SettingsSheet from '@/components/settings-sheet';

export default function Home() {
  return (
    <main className="relative flex flex-col items-center justify-center p-4 gap-6">
      <div className="absolute top-4 right-4 z-50">
        <SettingsSheet />
      </div>
      <RealtimeStage />
    </main>
  );
}
