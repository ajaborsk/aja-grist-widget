// Un widget pour gérer des calendriers "sparse" (peu denses), comme la programmation d'événements ponctuels sur le long terme

// TODO:


//const colorField = "PEC";
//const colorField = "Urgence";
const colorField = 'Couleur_UE'

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
    tooltips.style.backgroundColor =
      event.target.getAttribute('data-fill-color')
    tooltips.style.display = 'block'
  } else {
    tooltips.style.display = 'none'
  }
})

// Il faut au moins pouvoir lire la liste des activités.
grist.ready({ requiredAccess: 'read table', allowSelectBy: true })

grist.onRecords(
  async table => {
    // console.log('Record:', table[0]);

    // In this part, we'll get a mapping of the colors to use for the events. ------------------------------------
    // It can be either a text column (which should contain a CSS color name or code)
    //   or a tag (choice) field, in which case we are using the choice background color (style).
    const tokenInfo = await grist.docApi.getAccessToken({ readOnly: false })
    // My very own table id
    let table_id = await grist.getTable().getTableId()
    // Download the columns definitions
    const response = await fetch(
      `${tokenInfo.baseUrl}/tables/${table_id}/columns?auth=${tokenInfo.token}`,
      { method: 'GET' }
    )
    const columns_meta = (await response.json()).columns

    // Let's build the color mapping from the choice object (if any).
    // If the colorField is not a choice or if there is no colorField, then the mapping will be {} (empty object)
    let colors_mapping = {}
    for (i = 0; i < columns_meta.length; i++) {
      if (
        columns_meta[i].id == colorField &&
        columns_meta[i].fields.widgetOptions
      ) {
        const options = JSON.parse(columns_meta[i].fields.widgetOptions)
        colors_mapping = options.choiceOptions
        break
      }
    }

    // This function is used to get the event color. Always returns a {fillColor:'#...', textColor:"#..."} object.
    function getEventColor (event) {
      if (Object.keys(colors_mapping).length > 0) {
        const c = colors_mapping[event[colorField]]
        if (c) {
          return c
        } else {
          return { fillColor: '#fff', textColor: '#000' }
        }
      } else if (event[colorField]) {
        return { fillColor: event[colorField], textColor: '#000' }
      } else {
        return { fillColor: '#fff', textColor: '#000' }
      }
    }

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

    let groupsHashmap = {}
    {
      let data = await grist.docApi.fetchTable('Groupes')
      // console.log("Fetched data", data);
      for (idx = 0; idx < data.id.length; idx++) {
        groupsHashmap[data.Nom[idx]] = {
          id: data.id[idx],
          color: data.Couleur[idx]
        }
      }
    }
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

    // La boîte à outils
    let cell = document.createElement('div')
    cell.style.gridColumn = 1
    cell.innerHTML = "<span style='font-size:20px;'>&#128736;</span>"
    cell.classList.add('headerToolsCell')
    cell.addEventListener('click', event => {
      console.log('open tools...')
    })
    grid.appendChild(cell)

    // L'entête avec les noms des jours de la semaine
    weekdays = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']
    for (header_idx = 0; header_idx < 5; header_idx++) {
      let cell = document.createElement('div')
      cell.style.gridColumn = header_idx + 2
      cell.innerHTML = weekdays[header_idx]
      cell.classList.add('headerCell')
      grid.appendChild(cell)
    }

    // Les lignes...
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
            let activity_elt = document.createElement('div')
            activity_elt.classList.add('activity')

            // A small element to indicate which groups are participating the event/activity
            let activity_grp_elt = document.createElement('div')
            activity_grp_elt.classList.add('activity-groups')

            // console.log("==>",activityObject);

            if (activityObject['Contact_Prog']) {
              // We can drag/move it only if it hasn't been programmed yet
              activity_elt.classList.add('locked')
              activity_grp_elt.classList.add('locked')
            } else {
              activity_elt.setAttribute('draggable', 'true')
              activity_elt.addEventListener('dragstart', event => {
                event.dataTransfer.setData('text/plain', activityObject.id),
                  (tooltips.style.display = 'none')
              })
            }
            // Supprimé suite à l'ajout de l'affichage par groupes
            //if (activityObject.Mutualise_EB) {
            //  activity_elt.classList.add('shared');
            //}

            height = Math.round(
              (dayCell.getBoundingClientRect().height - 2) /
                activityObject.y_size
            ) // 2 is here because we want a 1px "margin"

            // TODO: use pixels (not percentage) to achieve a better display precision
            activity_elt.style.position = 'absolute'
            activity_elt.style.top = height * activityObject.y_pos + 1 + 'px' // 1 is the "margin"
            activity_elt.style.height = height - 8 + 'px' // 4 =  2 * border-width + 2 * padding
            activity_elt.style.left = activityObject.activityStart + '%'
            activity_elt.style.width =
              activityObject.activityEnd - activityObject.activityStart + '%'

            // The activity group(s) indicator
            activity_grp_elt.setAttribute('data-groups', activityObject.Groupes)
            activity_grp_elt.style.position = 'absolute'
            activity_grp_elt.style.top =
              height * activityObject.y_pos + 1 + height - 8 + 'px' // 4 =  2 * border-width + 2 * padding
            activity_grp_elt.style.height = 4 + 'px'
            activity_grp_elt.style.left = activityObject.activityStart + '%'
            activity_grp_elt.style.width =
              activityObject.activityEnd - activityObject.activityStart + '%'
            if (activityObject.Groupes.length > 0) {
              let colors = new Array()
              for (i = 0; i < activityObject.Groupes.length; i++) {
                colors.push(groupsHashmap[activityObject.Groupes[i]].color)
              }
              if (colors.length == 1) {
                activity_grp_elt.style.backgroundColor = colors[0]
              } else if (colors.length > 1) {
                // console.log("Colors:", colors);
                let colors_strs = []
                for (let i = 0; i < colors.length; i++) {
                  colors_strs.push(
                    colors[i] +
                      ' ' +
                      i * 6 +
                      'px, ' +
                      colors[i] +
                      ' ' +
                      (i + 1) * 6 +
                      'px'
                  )
                }
                activity_grp_elt.style.backgroundImage =
                  'repeating-linear-gradient(45deg, ' +
                  colors_strs.join(', ') +
                  ')'
              }
            }

            // On intègre plein de données directement dans les attributs du <DIV> de l'activité, pour les utilisations dans les fonctions JS (notamment le tooltip et pour le déplacement)
            activity_elt.setAttribute('data-id', activityObject.id)
            activity_elt.setAttribute('data-debut', activityObject.Debut)
            activity_elt.setAttribute('data-fin', activityObject.Fin)
            activity_elt.setAttribute(
              'data-enseignants',
              activityObject.Enseignant_s_
            )
            activity_elt.setAttribute('data-site', activityObject.Site)
            activity_elt.setAttribute('data-salle', activityObject.Salle)
            activity_elt.setAttribute('data-UE', activityObject.UE)
            activity_elt.setAttribute('data-sequence', activityObject.Sequence)
            const col = getEventColor(activityObject)
            activity_elt.setAttribute('data-fill-color', col.fillColor)
            activity_elt.style.backgroundColor = col.fillColor
            activity_elt.innerText = activityObject.Intitule
            dayCell.appendChild(activity_elt)
            dayCell.appendChild(activity_grp_elt)
          }
        }
      }
    }
  },
  { includeColumns: 'all', expandRefs: true }
)

grist.onRecord(record => {
  // console.log("onRecord:", record);
})
