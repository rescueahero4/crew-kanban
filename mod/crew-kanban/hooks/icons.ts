// The mockup's icons (.design-recall/mockups/assets), as SVG markup the desktop renderer draws
export const ICON = {
  // The git mark, 14x14: a diamond with a branch in it, for the branch the session started on
  git: (fill: string) =>
    `<rect x="2.4" y="2.4" width="9.2" height="9.2" rx="1.6" transform="rotate(45 7 7)" fill="${fill}"/>` +
    `<g fill="none" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round"><path d="M5.4 4.9v4.2M5.4 6.1l3.1 1.8"/></g>` +
    `<circle cx="5.4" cy="9.3" r="1" fill="#ffffff"/><circle cx="8.6" cy="8" r="1" fill="#ffffff"/>`,
  // A branch, 14x14: the branch the session moved to
  branch: (stroke: string) =>
    `<g fill="none" stroke="${stroke}" stroke-width="1.3" stroke-linecap="round"><circle cx="4" cy="3" r="1.6"/><circle cx="4" cy="11" r="1.6"/>` +
    `<circle cx="10.5" cy="4.5" r="1.6"/><path d="M4 4.6v4.8M10.5 6.1c0 2.4-3.2 2.2-5.6 3.6"/></g>`,
  // icon-chevron-down.svg, 14x14; rotated -90° when closed
  chevron: (stroke: string, isOpen: boolean) =>
    `<path d="M3.5 5.83333L7 9.33333L10.5 5.83333" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="${stroke}"${isOpen ? '' : ' transform="rotate(-90 7 7)"'}/>`,
  // icon-folder.svg, 14x14
  folder: (stroke: string) =>
    `<path d="M12.8333 11.0833V5.25C12.8333 4.94058 12.7104 4.64383 12.4916 4.42504C12.2728 4.20625 11.9761 4.08333 11.6667 4.08333H7.721C7.5043 4.08333 7.29188 4.02296 7.10755 3.90901C6.92323 3.79506 6.77428 3.63202 6.67742 3.43817L6.15592 2.39517C6.05901 2.20123 5.90997 2.03813 5.72553 1.92417C5.5411 1.81021 5.32855 1.7499 5.11175 1.75H2.33333C2.02391 1.75 1.72717 1.87292 1.50838 2.09171C1.28958 2.3105 1.16667 2.60725 1.16667 2.91667V11.0833C1.16667 11.3928 1.28958 11.6895 1.50838 11.9083C1.72717 12.1271 2.02391 12.25 2.33333 12.25H11.6667C11.9761 12.25 12.2728 12.1271 12.4916 11.9083C12.7104 11.6895 12.8333 11.3928 12.8333 11.0833Z" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="${stroke}"/>`,
  // icon-file.svg, 10.33x12.67
  file: (stroke: string) =>
    `<path d="M3.41667 6.91667H6.91667M3.41667 9.25H5.16667M0.5 1.66667V11C0.5 11.3094 0.622916 11.6062 0.841709 11.825C1.0605 12.0438 1.35725 12.1667 1.66667 12.1667H8.66667C8.97609 12.1667 9.27283 12.0438 9.49162 11.825C9.71042 11.6062 9.83333 11.3094 9.83333 11V4.1995C9.83331 4.04408 9.80224 3.89022 9.74194 3.74698C9.68163 3.60373 9.59331 3.47397 9.48217 3.36533L6.89217 0.8325C6.67421 0.619384 6.3815 0.500038 6.07667 0.5H1.66667C1.35725 0.5 1.0605 0.622916 0.841709 0.841709C0.622916 1.0605 0.5 1.35725 0.5 1.66667Z" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="${stroke}"/><path d="M6.33333 0.5V2.83333C6.33333 3.14275 6.45625 3.4395 6.67504 3.65829C6.89383 3.87708 7.19058 4 7.5 4H9.83333" fill="none" stroke-linejoin="round" stroke="${stroke}"/>`,
  // icon-pencil.svg, drawn at 14x14 from a 24x24 box
  pencil: (stroke: string) =>
    `<g transform="scale(${14 / 24})" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.333 16.048L16.57 3.81a2.56 2.56 0 0 1 3.62 3.619L7.951 19.667a2 2 0 0 1-1.022.547L3 21l.786-3.93a2 2 0 0 1 .547-1.022z"/><path d="M14.5 6.5l3 3"/></g>`,
  // icon-arrow-left.svg, 16x16
  back: (fill: string) =>
    `<path d="M12 8C12 8.13261 11.9473 8.25979 11.8536 8.35355C11.7598 8.44732 11.6326 8.5 11.5 8.5H5.707L7.854 10.646C7.90049 10.6925 7.93736 10.7477 7.96252 10.8084C7.98768 10.8692 8.00063 10.9343 8.00063 11C8.00063 11.0657 7.98768 11.1308 7.96252 11.1916C7.93736 11.2523 7.90049 11.3075 7.854 11.354C7.80751 11.4005 7.75232 11.4374 7.69158 11.4625C7.63084 11.4877 7.56574 11.5006 7.5 11.5006C7.43426 11.5006 7.36916 11.4877 7.30842 11.4625C7.24768 11.4374 7.19249 11.4005 7.146 11.354L4.146 8.354C4.09944 8.30755 4.06249 8.25238 4.03729 8.19163C4.01208 8.13089 3.99911 8.06577 3.99911 8C3.99911 7.93423 4.01208 7.86911 4.03729 7.80837C4.06249 7.74762 4.09944 7.69245 4.146 7.646L7.146 4.646C7.23989 4.55211 7.36722 4.49937 7.5 4.49937C7.63278 4.49937 7.76011 4.55211 7.854 4.646C7.94789 4.73989 8.00063 4.86722 8.00063 5C8.00063 5.13278 7.94789 5.26011 7.854 5.354L5.707 7.5H11.5C11.6326 7.5 11.7598 7.55268 11.8536 7.64645C11.9473 7.74021 12 7.86739 12 8Z" fill-rule="evenodd" clip-rule="evenodd" fill="${fill}"/>`,
}
