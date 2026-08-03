import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface Title {
    id: string;
    title: string;
    video_url?: string;
}

interface Props {
    title: Title;
}

export const TitleDetailPage: React.FC<Props> = ({ title: t }) => {
    const navigate = useNavigate();
            const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
        
    const videoRef = useRef<HTMLVideoElement>(null);

    const togglePlay = () => {
        if (videoRef.current) {
            if (playing) {
                videoRef.current.pause();
                setPlaying(false);
            } else {
                videoRef.current.play();
                setPlaying(true);
            }
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
            setDuration(videoRef.current.duration || 0);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = parseFloat(e.target.value);
        if (videoRef.current) {
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
        }
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    return (
        <div>
            <button 
                onClick={() => navigate(`/assistir/${t.id}`)} 
                className="px-4 py-2 bg-[#8a2be2] text-white rounded-lg font-medium hover:bg-[#9d4edd] transition shadow-lg"
            >
                Assistir Vídeo (Nativo do Site)
            </button>
            
            
                            </button>
                        </div>

                        {/* Rodapé: Barra de Progresso e Tempos */}
                        <div className="flex flex-col gap-2 pointer-events-auto">
                            <div className="flex items-center gap-3 text-xs text-zinc-300 font-mono">
                                <span>{formatTime(currentTime)}</span>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max={duration || 100} 
                                    value={currentTime} 
                                    onChange={handleSeek}
                                    className="flex-1 h-1.5 bg-white/25 rounded-lg appearance-none cursor-pointer accent-[#8a2be2] hover:bg-white/40 transition"
                                />
                                <span>{formatTime(duration)}</span>
                            </div>
                        </div>

                    </div>
                </div>
              </div>
            )}
        </div>
    );
};

















