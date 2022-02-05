"use strict";

const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

const config = {
	module: {
		rules: [{
			test: /\.ts$/,
			exclude: /node_modules/,
			use: "ts-loader",
		}],
	},
	resolve: {
		extensions: [
			".ts",
			".js",
		],
	},
};

module.exports = (env, argv) => {
	if (argv.mode === "production") {
		config.optimization = {
			minimize: true,
			minimizer: [new TerserPlugin({
				extractComments: false,
				terserOptions: {
					ecma: 2017,
					toplevel: true,
					compress: {
						passes: 2,
						toplevel: true,
					},
					mangle: {
						toplevel: true,
					},
					format: {
						comments: false,
					},
				},
			})],
		};
	}
	return config;
}
