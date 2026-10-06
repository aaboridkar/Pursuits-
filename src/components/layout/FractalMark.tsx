import fractalLogo from '../../assets/brand/fractal-logo.png'

/** The Fractal wordmark, from the corporate brand asset (392×84, ~4.67:1). */
export function FractalMark({ size = 19 }: { size?: number }) {
 return <img src={fractalLogo} alt="Fractal" height={size} className="shrink-0" style={{ height: size, width: 'auto' }} />
}