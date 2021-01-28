const filterFn = require('opentok-camera-filters');
const filterTask = require('opentok-camera-filters/src/filterTask');
const filterous = require('filterous/lib/instaFilters');

const filters = {};
// Add all of the filterous filters
Object.keys(filterous).forEach((filter) => {
  if (typeof filterous[filter] === 'function') {
    filters[filter] = (videoElement, canvas) => filterTask(videoElement, canvas, filterous[filter]);
  }
});

const getFilter = (props, filter) =>
  OT.getUserMedia(props).then(stream => filterFn(stream, filters[filter]));

angular.module('opentok-meet').directive('filteredPublisher', ['OTSession', '$rootScope',
  function filteredPublisher(OTSession, $rootScope) {
    return {
      restrict: 'E',
      scope: {
        props: '&',
        filter: '=',
      },
      link(scope, element, attrs) {
        const props = angular.copy(scope.props() || {});

        props.mirror = true;
        props.resolution = '320x240';
        props.width = props.width ? props.width : angular.element(element).width();
        props.height = props.height ? props.height : angular.element(element).height();
        const oldChildren = angular.element(element).children();

        if (scope.filterRunner) {
          scope.filterRunner.destroy();
        }
        getFilter(props, scope.filter).then((filterRunner) => {
          scope.filterRunner = filterRunner;
          [props.videoSource] = scope.filterRunner.canvas.captureStream(30).getVideoTracks();

          scope.publisher = OT.initPublisher(
            attrs.apikey || OTSession.session.apiKey,
            element[0], props, (err) => {
              if (err) {
                scope.$emit('otPublisherError', err, scope.publisher);
              }
            }
          );
          // Make transcluding work manually by putting the children back in there
          angular.element(element).append(oldChildren);
          scope.publisher.on({
            accessDenied() {
              scope.$emit('otAccessDenied');
            },
            accessDialogOpened() {
              scope.$emit('otAccessDialogOpened');
            },
            accessDialogClosed() {
              scope.$emit('otAccessDialogClosed');
            },
            accessAllowed() {
              angular.element(element).addClass('allowed');
              scope.$emit('otAccessAllowed');
            },
            loaded() {
              $rootScope.$broadcast('otLayout');
            },
            streamCreated(event) {
              scope.$emit('otStreamCreated', event);
            },
            streamDestroyed(event) {
              scope.$emit('otStreamDestroyed', event);
            },
            videoElementCreated(event) {
              event.element.addEventListener('resize', () => {
                $rootScope.$broadcast('otLayout');
              });
            },
          });
          scope.$watch('filter', (newValue) => {
            if (newValue === undefined || newValue === 'none') {
              return;
            }
            if (scope.filterRunner) {
              scope.filterRunner.change(filters[newValue]);
            }
          });
          scope.$on('$destroy', () => {
            if (OTSession.session) OTSession.session.unpublish(scope.publisher);
            else scope.publisher.destroy();
            if (scope.filterRunner) {
              scope.filterRunner.destroy();
            }
            OTSession.publishers =
              OTSession.publishers.filter(publisher => publisher !== scope.publisher);
            scope.publisher = null;
          });
          if (OTSession.session && (OTSession.session.connected ||
            (OTSession.session.isConnected && OTSession.session.isConnected()))) {
            OTSession.session.publish(scope.publisher, (err) => {
              if (err) {
                scope.$emit('otPublisherError', err, scope.publisher);
              }
            });
          }
          OTSession.addPublisher(scope.publisher);
        });
      },
    };
  },
]);
