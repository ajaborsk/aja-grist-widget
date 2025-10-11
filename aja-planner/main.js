// TODO:
// - Corriger l'affichage de la bulle pop-up (qui n'est pas toujours au bon endroit). Veiller à ce que cela ne gêne pas,
//    notamment si on veut faire un glisser/déposer.
// - Choisir le schéma de couleur (UE ou Urgence ou autre ?) et le stocker dans les options (pour tout le monde)
//    et/ou dans un stockage local (pour chaque utilisateur)
// - Gérer les groupes dans les enseignements (montrer visuellement qu'un enseignement est dispensé à un ou plusieurs groupes)
// - Gestion graphique des heures de début/fin (glisser) au lieu d'une granulosité à la demi-journée
// - Un mode "zoom" pour une session donnée : Mode vertical pour la journée et + de détails dans chaque boîte
//    Idées : Ajuster le contenu (horizontal/vertical, affichage des heures, etc.) en fonction
//      de la taille des blocs de journée et surtout de leur ratio hauteur/largeur
// - Données éditables directement (ou avec une boite pop-up) au lieu d'utiliser la fiche Grist

// Returns the ISO week of the date.
Date.prototype.getWeek = function () {
  let date = new Date(this.getTime())
  date.setHours(0, 0, 0, 0)
  // Thursday in current week decides the year.
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
  // January 4 is always in week 1.
  let week1 = new Date(date.getFullYear(), 0, 4)
  // Adjust to Thursday in week 1 and count number of weeks from date to week1.
  return (
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    )
  )
}

// Fonction qui retourne un booléen qui indique si deux intervalles de temps se chevauchent.
//   Elle est notamment utilisée pour l'arrangement des blocs sur l'écran (calcul de la position et de la hauteur des blocs)
function isColliding (a1_start, a1_end, a2_start, a2_end) {
  if (a1_start >= a2_end || a1_end <= a2_start) {
    return false
  } else {
    return true
  }
}

let grid = document.getElementById('ms_main_container')
let tooltips = document.getElementById('ms_tooltips')

grid.addEventListener('click', function (event) {
  // console.log(event.target.classList);
  if (event.target.classList.contains('activity')) {
    console.log({ rowId: event.target.getAttribute('data-id') })
    grist.setCursorPos({
      rowId: parseInt(event.target.getAttribute('data-id'))
    })
  }
})

// grid.addEventListener("drag", function (event)  {
// console.log(event.target.classList);
// if (event.target.classList.contains('activity')) {
//   console.log({rowId:event.target.getAttribute('data-id')});
//   grist.setCursorPos({rowId:parseInt(event.target.getAttribute('data-id'))});
// }
// });

grid.addEventListener('mouseover', function (event) {
  // console.log(event.target.classList);
  if (event.target.classList.contains('activity')) {
    let startDate = new Date(event.target.getAttribute('data-debut'))
    let endDate = new Date(event.target.getAttribute('data-fin'))
    tooltips.innerHTML =
      '<b>' +
      event.target.innerText +
      '</b><br>' +
      event.target.getAttribute('data-enseignants').replace(',', ', ') +
      '<br>' +
      '<i>' +
      event.target.getAttribute('data-site') +
      ' - ' +
      event.target.getAttribute('data-salle') +
      '</i><br>' +
      startDate.toLocaleDateString('fr-FR') +
      ', de ' +
      startDate.toLocaleTimeString('fr-FR').substring(0, 5) +
      ' à ' +
      endDate.toLocaleTimeString('fr-FR').substring(0, 5) +
      '<br><br>' +
      '<u>UE :</u> ' +
      event.target.getAttribute('data-UE') +
      '<br>' +
      '<u>Séquence :</u> ' +
      event.target.getAttribute('data-sequence')

    tooltips.style.left = event.clientX + 'px'
    tooltips.style.top = event.clientY + 'px'
    tooltips.style.backgroundColor = event.target.getAttribute('data-ue_color')
    tooltips.style.display = 'block'
  } else {
    tooltips.style.display = 'none'
  }
})

// Il faut au moins pouvoir lire la liste des activités.
grist.ready({ requiredAccess: 'read table', allowSelectBy: true })

grist.onRecords(
  table => {
    // console.log('Records:', table);

    // On va ranger les enregistrements (= événements = activités pédagogiques) dans un tableau 2D. Chaque ligne représente une semaine (index x 0=lundi).

    // Create a sessions hashmap (display ==> session Id)
    // This will be used to use the session id while modifying an activity
    // It's a asynchronous task, but we can hope that it be terminated well before the first activity move
    let sessionsHashmap = {}
    grist.docApi
      .fetchTable('Sessions')
      .then(data => {
        // console.log("Fetched data", data);
        for (idx = 0; idx < data.id.length; idx++) {
          sessionsHashmap[data.Identifiant[idx]] = {
            id: data.id[idx],
            start: data.Date_debut[idx],
            end: data.Date_fin[idx],
            groups: data.Groupes[idx]
          }
        }
      })
      .catch(error => {
        console.log('Sessions fetch error', error)
      })

    // On balaye tous les enregistrements pour les ranger par semaine :
    //   On crée une liste de "semaines"
    //   Chaque enregistrement de semaine est composée d'une liste :
    //     - Nom de la session [TODO: remplacer par une **liste** de sessions]
    //     - Date du premier jour de la semaine (lundi)
    //     - Cinq listes d'activités, pour chacun des jours de la semaine (du lundi au vendredi)
    let hashMap = {}
    for (record of table) {
      // Ignorons tous les enregistrement sans date de début (non programmés encore)
      if (record.Debut) {
        // console.debug("Début", record.Debut);
        // Calculons d'abord le code de la semaine concernée. On va créer un code qui sera composé de l'année sur 4 chiffres, d'un tiret du 6 et du numéro de semaine.
        let weekCode =
          record.Debut.getFullYear() +
          '-' +
          record.Debut.getWeek().toString().padStart(2, '0')

        if (hashMap[weekCode] === undefined) {
          // Cette semaine n'est pas encore dans le tableau : On crée une nouvelle ligne de semaine (vide)
          let mondayDate = new Date(record.Debut.getTime())
          mondayDate.setHours(0, 0, 0, 0)
          mondayDate.setDate(
            mondayDate.getDate() - ((mondayDate.getDay() + 6) % 7)
          )
          //console.log("monday:", mondayDate);

          hashMap[weekCode] = [new Array(), mondayDate, [], [], [], [], []]
        }

        // Le jour de la semaine, qui correspond aussi à l'index de la colonne dans le tableau des semaines
        let dayOfWeek = (record.Debut.getDay() + 6) % 7
        //record['dow'] = dayOfWeek;

        if (!hashMap[weekCode][0].includes(record.Session)) {
          hashMap[weekCode][0].push(record.Session)
        }

        // Add the activity in the day's activities list
        hashMap[weekCode][dayOfWeek + 2].push(record)

        //console.log(record);
      }
    }

    // Récupérons la liste de semaines utiles et trions-là (par ordre chronologique, en raison du format de création de la clef)
    let weeks = Object.keys(hashMap)
    weeks.sort()

    // Construisons maintenant la grille

    // 1 - S'assurer que la grille est vide (indispensable si c'est une mise à jour des données)
    grid.innerHTML = ''

    weekdays = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']
    for (header_idx = 0; header_idx < 5; header_idx++) {
      let cell = document.createElement('div')
      cell.style.gridColumn = header_idx + 2
      cell.innerHTML = weekdays[header_idx]
      cell.classList.add('headerCell')
      grid.appendChild(cell)
    }

    for (week of weeks) {
      // Le nom de la session (= semaine)
      let sessionCell = document.createElement('div')
      let week_date = new Date(hashMap[week][1])
      // console.log("week date:", hashMap[week][1], week_date, week_date.getDate()+1, toString(week_date.getDate()+1));
      sessionCell.innerHTML =
        '<span class="week-date">' +
        week_date.getDate().toString().padStart(2, '0') +
        '/' +
        (week_date.getMonth() + 1).toString().padStart(2, '0') +
        '/' +
        week_date.getFullYear().toString() +
        '</span>' +
        '<br><span class="session-names">' +
        hashMap[week][0].join(', ') +
        '</span>'
      sessionCell.style.gridColumn = 1
      sessionCell.classList.add('sessionCell')
      grid.appendChild(sessionCell)

      let mondayDate = hashMap[week][1]

      for (j = 0; j < 5; j++) {
        let thisDayDate = new Date(mondayDate.getTime())
        thisDayDate.setDate(mondayDate.getDate() + j)
        //console.log("Day:", thisDayDate);
        var dayCell = document.createElement('div')
        dayCell.style.gridColumn = j + 2
        dayCell.style.position = 'relative'
        dayCell.classList.add('dayCell')
        dayCell.setAttribute('data-session', hashMap[week][0])
        // Create a date object with the monday date
        let cellDate = new Date(hashMap[week][1])
        // Add 'j' whole days
        cellDate.setDate(cellDate.getDate() + j)

        dayCell.setAttribute(
          'data-date',
          cellDate.getFullYear() +
            '-' +
            (cellDate.getMonth() + 1).toString().padStart(2, '0') +
            '-' +
            cellDate.getDate().toString().padStart(2, '0')
        )

        // Someone can drop activity in this cell.
        // This eventListener is needed to allow dropping
        dayCell.addEventListener('dragover', event => {
          event.preventDefault()
        })
        // Actual dropping eventListener
        dayCell.addEventListener('drop', event => {
          const data = parseInt(event.dataTransfer.getData('text/plain'))
          // console.log("Dropped !", event, data, event.currentTarget);
          // Very ineficient way to get the source activity data:
          let src_activity = null
          for (idx = 0; idx < table.length; idx++) {
            if (table[idx].id == data) {
              src_activity = table[idx]
              break
            }
          }
          if (data !== null) {
            let percent = null
            if (event.target == event.currentTarget) {
              percent = (event.offsetX / event.target.clientWidth) * 100
            } else if (event.target.offsetParent == event.currentTarget) {
              percent =
                ((event.offsetX + event.target.offsetLeft) /
                  event.currentTarget.clientWidth) *
                100
            } else {
              console.warning('Unable to handle drop event target:', event)
            }
            // console.log("Dropped:", src_activity, percent);
            // Now, let's modify the activity session, date and times !

            let initial_duration =
              src_activity.Fin.getTime() - src_activity.Debut.getTime()
            //let initial_duration

            let the_date = new Date(
              event.currentTarget.getAttribute('data-date')
            )
            let start = new Date(the_date.getTime())
            if (percent < 50) {
              start.setHours(9, 0)
            } else {
              start.setHours(14, 0)
            }
            let end = new Date(start.getTime() + initial_duration)
            // console.log(start, end);

            //let sessions_table_id = await grist.getTable('Sessions').getTableId();
            //console.log("sessions_table_id", sessions_table_id);
            //let sessions_table = await grist.docApi.fetchTable(await grist.getTable('Sessions').getTableId());
            //console.log("sessions_table", sessions_table);
            // TODO: =====================================================================================================
            // Bon, ici, on utilise le code de session enregistré dans l'objet HTML mais ce c'est pas correct.
            // Il peut y avoir plusieurs sessions simultanément (promos différentes, formations différentes...)
            // Il faudrait donc choisir la session dont qui colle avec les groupes de l'activité (les groupes de l'activité
            //   doivent être dans les groupes de la session)
            let session_id =
              sessionsHashmap[event.currentTarget.getAttribute('data-session')]
                .id
            //console.log("onDrop: ", sessions_table, session_id);

            grist.getTable().update({
              id: src_activity.id,
              fields: {
                Session: session_id,
                Debut: start,
                Fin: end
              }
            })
          } else {
            console.warning('Dropped unknown activity code')
          }
        })
        grid.appendChild(dayCell)

        if (hashMap[week][j + 2].length > 0) {
          //dayCell.innerHTML = hashMap[week][j+1].length;
          // First pass : Check for time collisions
          // Ajoutons 2 pour obtenir le numéro de colonne (commence à 1) et pour tenir compte de l'entête de ligne (n° de session)
          for (a_idx = 0; a_idx < hashMap[week][j + 2].length; a_idx++) {
            let activityObject = hashMap[week][j + 2][a_idx]

            // Calculons les pourcentages, avec 0% = 8h du matin et 100% = 20h le soir.
            let activityStart = 0
            let activityEnd = 100

            if (activityObject.Debut != null && activityObject.Fin != null) {
              activityStart =
                (((activityObject.Debut.getTime() - thisDayDate.getTime()) /
                  1000.0 /
                  3600 -
                  8.0) *
                  100.0) /
                11.0
              activityEnd =
                (((activityObject.Fin.getTime() - thisDayDate.getTime()) /
                  1000.0 /
                  3600.0 -
                  8.0) *
                  100.0) /
                11.0
            }
            activityObject.activityStart = activityStart
            activityObject.activityEnd = activityEnd
            activityObject.y_pos = 0
            activityObject.y_size = 1

            // Cherchons parmi les activités déjà examinées dans cette journée
            for (b_idx = 0; b_idx < a_idx; b_idx++) {
              let activityObject2 = hashMap[week][j + 2][b_idx]
              if (
                isColliding(
                  activityObject.activityStart,
                  activityObject.activityEnd,
                  activityObject2.activityStart,
                  activityObject2.activityEnd
                )
              ) {
                activityObject.y_pos = activityObject2.y_pos + 1
                activityObject.y_size = activityObject2.y_size =
                  activityObject2.y_size + 1
                // console.log("Collision:", activityObject, activityObject2);
              }
            }
            // console.log("Activity", activityObject);
          }

          // Second pass: Create the <DIV> and put it in the grid
          for (a_idx = 0; a_idx < hashMap[week][j + 2].length; a_idx++) {
            let activityObject = hashMap[week][j + 2][a_idx]

            // On construit un élément <DIV> et on le range dans la cellule du bon jour du calendrier
            let activity = document.createElement('div')
            activity.classList.add('activity')
            // console.log("==>",activityObject);

            if (activityObject['Contact_Prog']) {
              // We can drag/move it only if it hasn't been programmed yet
              activity.classList.add('locked')
            } else {
              activity.setAttribute('draggable', 'true')
              activity.addEventListener('dragstart', event => {
                event.dataTransfer.setData('text/plain', activityObject.id),
                  (tooltips.style.display = 'none')
              })
            }
            if (activityObject.Mutualise_EB) {
              activity.classList.add('shared')
            }
            activity.style.position = 'absolute'

            height = 90 / activityObject.y_size

            activity.style.top = height * activityObject.y_pos + 1 + '%'
            activity.style.height = height - 2 + '%'
            activity.style.left = activityObject.activityStart + '%'
            activity.style.width =
              activityObject.activityEnd - activityObject.activityStart + '%'

            // On intègre plein de données directement dans les attributs du <DIV> de l'activité, pour les utilisations dans les fonctions JS (notamment le tooltip et pour le déplacement)
            activity.setAttribute('data-id', activityObject.id)
            activity.setAttribute('data-debut', activityObject.Debut)
            activity.setAttribute('data-fin', activityObject.Fin)
            activity.setAttribute(
              'data-enseignants',
              activityObject.Enseignant_s_
            )
            activity.setAttribute('data-site', activityObject.Site)
            activity.setAttribute('data-salle', activityObject.Salle)
            activity.setAttribute('data-UE', activityObject.UE)
            activity.setAttribute('data-sequence', activityObject.Sequence)
            activity.setAttribute('data-ue_color', activityObject.Couleur_UE)
            activity.style.backgroundColor = activityObject.Couleur_UE
            activity.innerText = activityObject.Intitule
            dayCell.appendChild(activity)
          }
        }
      }
    }
  },
  { includeColumns: 'shown', expandRefs: true }
)

grist.onRecord(record => {
  // console.log("onRecord:", record);
})
