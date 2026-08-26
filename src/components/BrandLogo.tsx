import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

/**
 * Logo oficial do MovieFlix (imagem gerada pelo dono).
 *
 * Usado na Navbar, Footer, páginas de autenticação (login/cadastro) e seleção
 * de perfil. Sempre clicável: navega para a Home ("/").
 *
 * Props:
 * - size: tamanho da imagem do logo (padrão 32px; use 'sm' | 'md' | 'lg' | número)
 * - showText: se deve exibir a palavra "MOVIEFLIX" ao lado do logo
 * - className: classes extras
 * - onClick: handler opcional
 */
interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | number;
  showText?: boolean;
  textClassName?: string;
  className?: string;
  onClick?: () => void;
}

const SIZE_MAP = { sm: 28, md: 36, lg: 44 } as const;

export function BrandLogo({
  size = 'md',
  showText = true,
  textClassName,
  className,
  onClick,
}: BrandLogoProps) {
  const px = typeof size === 'number' ? size : SIZE_MAP[size];

  return (
    <Link
      to="/"
      onClick={onClick}
      aria-label="MovieFlix — ir para a página inicial"
      className={cn('flex items-center gap-2', className)}
    >
      <img
        src="/logo.png"
        alt="MovieFlix"
        width={px}
        height={px}
        className="shrink-0 rounded-md object-contain"
        style={{ width: px, height: px }}
        draggable={false}
      />
      {showText && (
        <span
          className={cn(
            'font-display tracking-wide text-white',
            textClassName ?? 'text-lg sm:text-xl lg:text-2xl',
          )}
        >
          MOVIEFLIX
        </span>
      )}
    </Link>
  );
}
