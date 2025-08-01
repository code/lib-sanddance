/*!
* Copyright (c) Microsoft Corporation.
* Licensed under the MIT License.
*/

namespace SandDanceEmbed {

    declare let vega: SandDanceExplorer.SandDance.VegaMorphCharts.types.VegaBase;
    declare let FluentUIReact: _FluentUI.FluentUIComponents;
    declare let FluentUIIcons: _FluentUIIcons.FluentUIIconsBase;

    interface DataWithInsight {
        data: DataToLoad;
        insight: Partial<SandDanceExplorer.SandDance.specs.Insight>;
    }

    export let sandDanceExplorer: SandDanceExplorer.Explorer_Class;
    export const requests: MessageRequestWithSource[] = [];
    let creating = false;
    let innerLoad: () => void;

    export function load(
        data: DataToLoad,
        insight?: Partial<SandDanceExplorer.SandDance.specs.Insight>,
        props?: SandDanceExplorer.Props,
        options?: SandDanceExplorer.Options,
    ) {
        return new Promise((resolve) => {

            innerLoad = () => {
                let getPartialInsight: (columns: SandDanceExplorer.SandDance.types.Column[]) => Partial<SandDanceExplorer.SandDance.specs.Insight>;
                if (insight) {
                    //TODO make sure that insight columns exist in dataset
                    getPartialInsight = columns => insight;
                }
                sandDanceExplorer.load(data, getPartialInsight, options).then(resolve);
            };

            const create = () => {
                creating = true;
                prepare.then(() => {
                    if (typeof FluentUIIcons !== 'undefined' && FluentUIIcons) {
                        FluentUIIcons.use(FluentUIReact.registerIcons, FluentUIReact.unregisterIcons);
                        FluentUIIcons.initializeIcons();
                    }
                    SandDanceExplorer.use(FluentUIReact, React, ReactDOM, vega);

                    const theme = props?.theme || '';
                    if (theme) {
                        FluentUIReact.loadTheme({ palette: SandDanceExplorer.themePalettes[theme] });
                    }
                    const viewerOptions = getViewerOptions(theme, props?.viewerOptions);

                    const explorerProps: SandDanceExplorer.Props = {
                        logoClickUrl: 'https://microsoft.github.io/SandDance/',
                        ...props,
                        mounted: explorer => {
                            sandDanceExplorer = explorer;
                            creating = false;
                            innerLoad();
                            props?.mounted && props.mounted(explorer);
                        },
                        viewerOptions,
                    };
                    ReactDOM.render(React.createElement(SandDanceExplorer.Explorer, explorerProps), document.body);
                });
            };

            if (sandDanceExplorer) {
                innerLoad();
            } else if (!creating) {
                create();
            }
        });
    }

    function getViewerOptions(theme: string, viewerOptions: Partial<SandDanceExplorer.SandDance.types.ViewerOptions>): Partial<SandDanceExplorer.ViewerOptions> {
        return {
            ...viewerOptions,
            colors: SandDanceExplorer.getColorSettingsFromThemePalette(SandDanceExplorer.themePalettes[theme]),
            onError: (errors) => {
                const response: MessageResponse_EventError = {
                    request: null,
                    errors,
                };
                lastRequestWithSource?.source.postMessage(response, '*');
            },
            onCanvasClick: (e) => {
                const request: MessageRequest_EventCanvasClick = {
                    action: 'eventCanvasClick',
                };
                const response: MessageResponse_EventCanvasClick = {
                    request,
                    event: safeSerialize(e),
                };
                lastRequestWithSource?.source.postMessage(response, '*');
            },
            onCubeClick: (e, cube) => {
                const request: MessageRequest_EventCubeClick = {
                    action: 'eventCubeClick',
                };
                const response: MessageResponse_EventCubeClick = {
                    request,
                    event: safeSerialize(e),
                    ordinal: cube.ordinal,
                };
                lastRequestWithSource?.source.postMessage(response, '*');
            },
        };
    }

    function safeSerialize<T>(input: T) {
        const output = {} as T;
        for (const key in input) {
            const value = input[key];
            switch (typeof value) {
                case 'undefined':
                case 'number':
                case 'boolean':
                case 'string':
                    output[key] = value;
            }
        }
        return output;
    }

    export function changeColorScheme(darkTheme: boolean) {
        const theme = darkTheme ? 'dark-theme' : '';
        FluentUIReact.loadTheme({ palette: SandDanceExplorer.themePalettes[theme] });

        const viewerOptions = getViewerOptions(theme, sandDanceExplorer.viewerOptions);
        vega.scheme(SandDanceExplorer.SandDance.constants.ColorScaleNone, () => viewerOptions.colors.defaultCube);

        sandDanceExplorer.updateViewerOptions(viewerOptions);
        sandDanceExplorer.viewer.renderSameLayout(viewerOptions);
        const props: SandDanceExplorer.Props = { ...sandDanceExplorer.props, theme, viewerOptions };
        ReactDOM.render(React.createElement(SandDanceExplorer.Explorer, props), document.body);
    }

    export let lastRequestWithSource: MessageRequestWithSource;

    export function respondToRequest(requestWithSource: MessageRequestWithSource) {
        lastRequestWithSource = requestWithSource;
        requests.push(requestWithSource);
        const copy: MessageRequestWithSource = { ...requestWithSource };
        delete copy.source;
        const request: MessageRequest = { ...copy };
        let response: MessageResponse;
        switch (request.action) {
            case 'init': {
                response = {
                    request,
                };
                break;
            }
            case 'load': {
                const request_load = request as MessageRequest_Load;
                load(
                    request_load.data,
                    request_load.insight,
                    request_load.props,
                    request_load.options,
                ).then(() => {
                    response = {
                        request,
                    };
                    requestWithSource.source.postMessage(response, '*');
                });
                //don't keep a copy of the array
                delete request_load.data;
                break;
            }
            case 'getData': {
                response = <MessageResponse_GetData>{
                    request,
                    data: sandDanceExplorer.state.dataContent.data,
                };
                break;
            }
            case 'getInsight': {
                response = <MessageResponse_GetInsight>{
                    request,
                    insight: sandDanceExplorer.getInsight(),
                };
                break;
            }
            case 'getSetup': {
                const setup: SandDanceExplorer.SandDance.types.Setup = sandDanceExplorer.getSetup();
                setup.camera = sandDanceExplorer.viewer.getCamera();
                response = <MessageResponse_GetSetup>{
                    request,
                    setup,
                };
                break;
            }
            case 'theme': {
                const request_theme = request as MessageRequest_Theme;
                if (request_theme.dark !== undefined) {
                    changeColorScheme(request_theme.dark);
                }
                response = <MessageResponse_Theme>{
                    request,
                    theme: sandDanceExplorer.props.theme,
                };
            }
        }
        prepare.then(() => {
            if (response) {
                requestWithSource.source.postMessage(response, '*');
            }
        });
    }

    window.addEventListener('message', e => {
        let payload: object[] | DataWithInsight | MessageRequest = e.data;
        if (!payload) return;
        if (Array.isArray(payload)) {
            const data = payload;
            const requestLoadFromArray: MessageRequest_Load = {
                action: 'load',
                data,
                insight: null,
            };
            payload = requestLoadFromArray;
        } else {
            const dataWithInsight = payload as DataWithInsight;
            if (Array.isArray(dataWithInsight.data)) {
                const requestLoadFromDataWithInsight: MessageRequest_Load = {
                    action: 'load',
                    ...dataWithInsight,
                };
                payload = requestLoadFromDataWithInsight;
            }
        }
        const request = payload as MessageRequest;
        if (!request) return;
        const requestWithSource = { ...request, source: e.source as WindowProxy };
        respondToRequest(requestWithSource);
    });

    if (window.opener) {
        const request: MessageRequest_Init = {
            action: 'init',
            ts: new Date(),
        };
        respondToRequest({ ...request, source: window.opener });
    }
}
