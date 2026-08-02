import { BasePage } from './base.page';

/**
 * Page object for the dynamic user detail page (/user/[id]).
 *
 * Layout: .user-card contains .user-id and two .route-info paragraphs.
 */
export class UserDetailPage extends BasePage {
  constructor(id: string | number = 1) {
    super(`/user/${id}`);
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }

  /** The displayed user ID (inside <strong>). */
  async displayedUserId(): Promise<string | null> {
    return this.text('.user-id strong');
  }

  /** The route pattern shown on the page (first .route-info, first code). */
  async displayedRoutePattern(): Promise<string | null> {
    // .user-card children: p.user-id(1st), p.route-info(2nd), p.route-info(3rd)
    return this.text('.user-card p:nth-child(2) code:first-of-type');
  }

  /** The resolved route shown on the page (first .route-info, second code). */
  async displayedResolvedRoute(): Promise<string | null> {
    return this.text('.user-card p:nth-child(2) code:nth-of-type(2)');
  }

  /** The current URL shown on the page (second .route-info code). */
  async displayedUrl(): Promise<string | null> {
    return this.text('.user-card p:nth-child(3) code');
  }
}
