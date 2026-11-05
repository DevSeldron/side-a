import type { ReactElement } from 'react'

/**
 * A deliberately quiet backdrop: a star field and three mountain ridges.
 * Every colour comes from the live accent variables, so rainbow mode carries
 * through the whole scene without a separate animation loop.
 */
export function MountainBackdrop(): ReactElement {
  return (
    <div className="mountain-backdrop" aria-hidden="true">
      <svg
        className="mountain-stars"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <circle className="mountain-star" cx="82" cy="90" r="1.5" opacity="0.7" />
        <circle className="mountain-star" cx="174" cy="170" r="1" opacity="0.45" />
        <circle className="mountain-star is-bright" cx="250" cy="72" r="2.2" opacity="0.9" />
        <circle className="mountain-star" cx="330" cy="142" r="1.7" opacity="0.68" />
        <circle className="mountain-star" cx="410" cy="48" r="1" opacity="0.4" />
        <circle className="mountain-star" cx="470" cy="210" r="1.3" opacity="0.78" />
        <circle className="mountain-star" cx="560" cy="98" r="1.1" opacity="0.52" />
        <circle className="mountain-star" cx="618" cy="174" r="1.9" opacity="0.74" />
        <circle className="mountain-star" cx="700" cy="64" r="1.2" opacity="0.48" />
        <circle className="mountain-star" cx="760" cy="136" r="1" opacity="0.7" />
        <circle className="mountain-star" cx="840" cy="44" r="1.5" opacity="0.62" />
        <circle className="mountain-star" cx="910" cy="188" r="1.2" opacity="0.55" />
        <circle className="mountain-star is-bright" cx="980" cy="98" r="1.8" opacity="0.9" />
        <circle className="mountain-star" cx="1050" cy="56" r="1" opacity="0.5" />
        <circle className="mountain-star" cx="1120" cy="156" r="1.2" opacity="0.7" />
        <circle className="mountain-star" cx="1210" cy="78" r="1.7" opacity="0.66" />
        <circle className="mountain-star" cx="1290" cy="180" r="1" opacity="0.48" />
        <circle className="mountain-star" cx="1360" cy="100" r="1.3" opacity="0.74" />
        <circle className="mountain-star" cx="80" cy="300" r="1" opacity="0.5" />
        <circle className="mountain-star" cx="160" cy="250" r="1.5" opacity="0.68" />
        <circle className="mountain-star" cx="240" cy="330" r="1.1" opacity="0.44" />
        <circle className="mountain-star" cx="320" cy="270" r="1" opacity="0.62" />
        <circle className="mountain-star" cx="410" cy="356" r="1.6" opacity="0.7" />
        <circle className="mountain-star" cx="500" cy="286" r="1.2" opacity="0.5" />
        <circle className="mountain-star" cx="580" cy="336" r="1" opacity="0.6" />
        <circle className="mountain-star" cx="660" cy="252" r="1.3" opacity="0.76" />
        <circle className="mountain-star" cx="760" cy="306" r="1.7" opacity="0.58" />
        <circle className="mountain-star" cx="850" cy="260" r="1" opacity="0.46" />
        <circle className="mountain-star is-bright" cx="940" cy="344" r="1.6" opacity="0.86" />
        <circle className="mountain-star" cx="1040" cy="280" r="1.1" opacity="0.62" />
        <circle className="mountain-star" cx="1140" cy="330" r="1.5" opacity="0.54" />
        <circle className="mountain-star" cx="1230" cy="250" r="1" opacity="0.72" />
        <circle className="mountain-star" cx="1320" cy="310" r="1.3" opacity="0.5" />
        <circle className="mountain-star" cx="1390" cy="270" r="1" opacity="0.64" />
        <circle className="mountain-star" cx="110" cy="410" r="1.2" opacity="0.58" />
        <circle className="mountain-star" cx="210" cy="450" r="1" opacity="0.44" />
        <circle className="mountain-star" cx="310" cy="400" r="1.4" opacity="0.66" />
        <circle className="mountain-star" cx="430" cy="460" r="1" opacity="0.5" />
        <circle className="mountain-star" cx="550" cy="420" r="1.5" opacity="0.72" />
        <circle className="mountain-star" cx="680" cy="470" r="1" opacity="0.42" />
        <circle className="mountain-star" cx="800" cy="410" r="1.2" opacity="0.6" />
        <circle className="mountain-star" cx="930" cy="460" r="1" opacity="0.52" />
        <circle className="mountain-star" cx="1060" cy="420" r="1.4" opacity="0.68" />
        <circle className="mountain-star" cx="1190" cy="470" r="1" opacity="0.46" />
        <circle className="mountain-star" cx="1320" cy="430" r="1.2" opacity="0.6" />
      </svg>

      <svg
        className="mountain-range"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
      >
        <path
          className="mountain-far"
          d="M0 646 126 590 256 632 388 548 522 618 654 572 798 648 930 584 1078 638 1212 570 1344 630 1440 592V900H0Z"
        />
        <path
          className="mountain-mid"
          d="M0 720 158 656 300 700 434 610 590 708 722 664 878 730 1038 650 1190 718 1330 668 1440 708V900H0Z"
        />
        <path
          className="mountain-near"
          d="M0 810 112 770 232 800 360 734 522 814 690 764 842 820 992 760 1130 804 1284 744 1440 800V900H0Z"
        />
      </svg>
    </div>
  )
}
