# TODO aja-planner

- [ ] Corriger l'affichage de la bulle pop-up (qui n'est pas toujours au bon endroit). Veiller à ce que cela ne gêne pas,
notamment si on veut faire un glisser/déposer.

- [ ] Choisir le schéma de couleur (UE ou Urgence ou autre ?) et le stocker dans les options (pour tout le monde)
et/ou dans un stockage local (pour chaque utilisateur)
- [X] Gérer les groupes dans les enseignements (montrer visuellement qu'un enseignement est dispensé à un ou plusieurs groupes)
- [ ] Prévoir une configuration avec deux "schémas" : debut/fin ou date/heure/durée  (on ne peut pas simuler les deux avec les formules d'initialisation Grist donc il faut gérer côté widget...)
- [ ] Un mode "zoom" pour une session donnée : Mode vertical pour la journée et + de détails dans chaque boîte
Idée : Ajuster le contenu (horizontal/vertical, affichage des heures, etc.) en fonction
      de la taille des blocs de journée et surtout de leur ratio hauteur/largeur
- [ ] Gestion graphique des heures de début/fin (glisser) au lieu d'une granulosité à la demi-journée
- [ ] Données éditables directement (ou avec une boite pop-up) au lieu d'utiliser la fiche Grist
Idée : Peut-être mettre une vue grist "fiche" en mode embed dans une iframe/popup ?
- [ ] Menu contextuel (click droit) sur une fiche : Editer la fiche ? Envoi d'invitation ? Autre détail (plus que le tooltip) ?
- [ ] Menu contextuel (click droit) sur une journée : Créer un événement
- [ ] Rendre le widget générique (non spécifique au MS IMTS ni même à la formation)
- [ ] Gestion d'alerte double usage ressource (salles, enseignants..)