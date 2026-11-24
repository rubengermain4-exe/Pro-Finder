return html`
  <section class="profile-showcase">
    <div class="profile-showcase__cover">

      ${coverUrl ? html`
        <img
          class="profile-showcase__cover-image"
          src="${coverUrl}"
          alt="Couverture de ${b.name}"
        />
      ` : ''}

      <div class="profile-showcase__shade"></div>

      <div class="container profile-showcase__inner">
        <!-- Contenu de ta bannière -->
      </div>

    </div>
  </section>
`;